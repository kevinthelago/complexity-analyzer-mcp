import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findHotspots } from "../engine/hotspots/index.js";
import { analyzeUnit, parseCode } from "../engine/index.js";
import type { RecursionInfo, UncertainNode } from "../engine/index.js";
import { resolveInput } from "../engine/input/index.js";
import { suggestOptimizations } from "../engine/suggest/index.js";
import { deepAnalyzeUnit } from "../llm/index.js";
import type { LLMAlternative, LLMClient } from "../llm/index.js";
import { measure as defaultMeasure } from "../runtime/index.js";
import type { EmpiricalResult, MeasureOptions, MeasureOutcome } from "../runtime/index.js";

// ── Public types ─────────────────────────────────────────────────────────────

export type MeasureFn = (opts: MeasureOptions) => Promise<MeasureOutcome>;

export interface CliOptions {
  path: string;
  json: boolean;
  deep: boolean;
  measure?: boolean;
  /** JS expression `(n: number) => args` for the empirical sweep. */
  generator?: string;
  lang?: string;
}

export interface UnitResult {
  kind: string;
  name: string;
  startLine: number;
  endLine: number;
  timeComplexity: string;
  spaceComplexity: string;
  confidence: "high" | "medium" | "low";
  recursion?: RecursionInfo;
  uncertainNodes: UncertainNode[];
  // LLM enrichment (--deep only)
  llmStatus?: "ok" | "llm_unavailable" | "llm_error";
  verifiedTimeComplexity?: string;
  verifiedSpaceComplexity?: string;
  llmRationale?: string;
  alternative?: LLMAlternative;
  // Empirical measurement (--measure only)
  measureStatus?: "ok" | "timeout" | "oom" | "error" | "skipped";
  empiricalBigO?: string;
  empiricalR2?: number;
  empiricalConfidence?: "high" | "medium" | "low";
  empiricalReconciliation?: "agree" | "diverge" | "inconclusive";
  measureError?: string;
}

export interface AnalysisOutput {
  file: string;
  lang: string;
  parseError?: string;
  units: UnitResult[];
}

export interface CliRunResult {
  output: string;
  exitCode: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

/** Default generator: produces a number array of size n. */
export const DEFAULT_GENERATOR = "(n) => [Array.from({length: n}, (_, i) => i)]";

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectLang(filePath: string, langOverride?: string): string {
  if (langOverride) return langOverride;
  const ext = extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "ts";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "js";
  return "ts";
}

function parserFilename(filePath: string, lang: string): string {
  const base = filePath.split(/[\\/]/).at(-1) ?? "input";
  const ext = extname(base);
  if (ext) return base;
  return lang === "js" ? `${base}.js` : `${base}.ts`;
}

function attachEmpirical(entry: UnitResult, outcome: MeasureOutcome): void {
  entry.measureStatus = outcome.status;
  if (outcome.status === "ok" && outcome.empirical) {
    const e: EmpiricalResult = outcome.empirical;
    entry.empiricalBigO = e.bigO;
    entry.empiricalR2 = e.rSquared;
    entry.empiricalConfidence = e.confidence;
    entry.empiricalReconciliation = e.reconciliation;
  } else if (outcome.errorMessage) {
    entry.measureError = outcome.errorMessage;
  }
}

// ── Analysis runners ──────────────────────────────────────────────────────────

/** Static-only analysis. Synchronous. */
export function runAnalysis(source: string, filePath: string, lang?: string): AnalysisOutput {
  const detectedLang = detectLang(filePath, lang);
  const filename = parserFilename(filePath, detectedLang);
  const parseResult = parseCode(source, filename);

  if (!parseResult.success) {
    return {
      file: filePath,
      lang: detectedLang,
      parseError: parseResult.parseError?.message ?? "Parse failed",
      units: [],
    };
  }

  const units: UnitResult[] = parseResult.units.map((unit) => {
    const r = analyzeUnit(unit);
    const entry: UnitResult = {
      kind: unit.kind,
      name: unit.name,
      startLine: unit.startLine,
      endLine: unit.endLine,
      timeComplexity: r.timeComplexity,
      spaceComplexity: r.spaceComplexity,
      confidence: r.confidence,
      uncertainNodes: r.uncertainNodes,
    };
    if (r.recursion !== undefined) entry.recursion = r.recursion;
    return entry;
  });

  return { file: filePath, lang: detectedLang, units };
}

/**
 * Static analysis + empirical sweep per unit.
 * Passes `measureFn` to allow injection of a mock in tests.
 */
export async function runMeasureAnalysis(
  source: string,
  filePath: string,
  generatorCode = DEFAULT_GENERATOR,
  lang?: string,
  measureFn: MeasureFn = defaultMeasure,
): Promise<AnalysisOutput> {
  const detectedLang = detectLang(filePath, lang);
  const filename = parserFilename(filePath, detectedLang);
  const parseResult = parseCode(source, filename);

  if (!parseResult.success) {
    return {
      file: filePath,
      lang: detectedLang,
      parseError: parseResult.parseError?.message ?? "Parse failed",
      units: [],
    };
  }

  const units: UnitResult[] = await Promise.all(
    parseResult.units.map(async (unit) => {
      const r = analyzeUnit(unit);
      const entry: UnitResult = {
        kind: unit.kind,
        name: unit.name,
        startLine: unit.startLine,
        endLine: unit.endLine,
        timeComplexity: r.timeComplexity,
        spaceComplexity: r.spaceComplexity,
        confidence: r.confidence,
        uncertainNodes: r.uncertainNodes,
      };
      if (r.recursion !== undefined) entry.recursion = r.recursion;

      const outcome = await measureFn({
        targetPath: filePath,
        exportName: unit.name,
        generatorCode,
        staticTimeComplexity: r.timeComplexity,
      });
      attachEmpirical(entry, outcome);

      return entry;
    }),
  );

  return { file: filePath, lang: detectedLang, units };
}

/** LLM-enriched analysis (static + deepAnalyzeUnit per unit). Async. */
export async function runDeepAnalysis(
  source: string,
  filePath: string,
  lang?: string,
  client?: LLMClient,
  empiricalMap?: Map<string, EmpiricalResult>,
): Promise<AnalysisOutput> {
  const detectedLang = detectLang(filePath, lang);
  const filename = parserFilename(filePath, detectedLang);
  const parseResult = parseCode(source, filename);

  if (!parseResult.success) {
    return {
      file: filePath,
      lang: detectedLang,
      parseError: parseResult.parseError?.message ?? "Parse failed",
      units: [],
    };
  }

  const units: UnitResult[] = await Promise.all(
    parseResult.units.map(async (unit) => {
      const staticResult = analyzeUnit(unit);
      const hotspots = findHotspots(unit, staticResult);
      const suggestions = suggestOptimizations(unit, staticResult);
      const empirical = empiricalMap?.get(unit.name);
      const deepInput = empirical
        ? { unit, staticResult, hotspots, suggestions, empirical }
        : { unit, staticResult, hotspots, suggestions };
      const deepResult = await deepAnalyzeUnit(deepInput, client);

      const entry: UnitResult = {
        kind: unit.kind,
        name: unit.name,
        startLine: unit.startLine,
        endLine: unit.endLine,
        timeComplexity: deepResult.verifiedTimeComplexity ?? staticResult.timeComplexity,
        spaceComplexity: deepResult.verifiedSpaceComplexity ?? staticResult.spaceComplexity,
        confidence: staticResult.confidence,
        llmStatus: deepResult.llmStatus,
        uncertainNodes: staticResult.uncertainNodes,
      };
      if (staticResult.recursion !== undefined) entry.recursion = staticResult.recursion;
      if (deepResult.verifiedTimeComplexity !== undefined)
        entry.verifiedTimeComplexity = deepResult.verifiedTimeComplexity;
      if (deepResult.verifiedSpaceComplexity !== undefined)
        entry.verifiedSpaceComplexity = deepResult.verifiedSpaceComplexity;
      if (deepResult.llmRationale !== undefined) entry.llmRationale = deepResult.llmRationale;
      if (deepResult.alternative !== undefined) entry.alternative = deepResult.alternative;
      return entry;
    }),
  );

  return { file: filePath, lang: detectedLang, units };
}

// ── Formatting ────────────────────────────────────────────────────────────────

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "✓ high",
  medium: "~ medium",
  low: "? low",
};

export function formatHuman(result: AnalysisOutput): string {
  const lines: string[] = [];
  lines.push(`Analysis: ${result.file}  [${result.lang}]`);
  lines.push("─".repeat(60));

  if (result.parseError) {
    lines.push(`Parse error: ${result.parseError}`);
    return lines.join("\n");
  }

  if (result.units.length === 0) {
    lines.push("No analyzable functions or methods found.");
    return lines.join("\n");
  }

  for (const u of result.units) {
    lines.push("");
    lines.push(`${u.kind.padEnd(11)} ${u.name}  (lines ${u.startLine}–${u.endLine})`);
    lines.push(`  Time:       ${u.timeComplexity}`);
    lines.push(`  Space:      ${u.spaceComplexity}`);
    lines.push(`  Confidence: ${CONFIDENCE_BADGE[u.confidence] ?? u.confidence}`);

    if (u.measureStatus === "ok") {
      lines.push(
        `  Empirical:  ${u.empiricalBigO} (R²=${u.empiricalR2?.toFixed(3)}, ` +
          `${u.empiricalConfidence}, ${u.empiricalReconciliation})`,
      );
    } else if (u.measureStatus && u.measureStatus !== "skipped") {
      lines.push(`  Empirical:  ${u.measureStatus}${u.measureError ? ` — ${u.measureError}` : ""}`);
    }

    if (u.llmStatus === "ok" && u.llmRationale) {
      lines.push(`  LLM note:   ${u.llmRationale}`);
    }

    if (u.recursion) {
      lines.push(`  Recursion:  ${u.recursion.kind} — ${u.recursion.rationale}`);
    }

    if (u.uncertainNodes.length > 0) {
      lines.push("  Uncertain:");
      for (const n of u.uncertainNodes) {
        lines.push(`    ${n.line}:${n.col}  ${n.description}`);
      }
    }

    if (u.alternative) {
      lines.push("  Alternative:");
      lines.push(`    Time:    ${u.alternative.timeComplexity}`);
      lines.push(`    Space:   ${u.alternative.spaceComplexity}`);
      lines.push(`    Why:     ${u.alternative.rationale}`);
    }
  }

  return lines.join("\n");
}

// ── Arg parser ───────────────────────────────────────────────────────────────

export interface ParsedArgs {
  opts: CliOptions;
  helpText?: string;
  error?: string;
}

const USAGE = `Usage: complexity-analyzer analyze <path> [options]

  <path>  File path or glob pattern (e.g. 'src/**/*.ts')

Options:
  --json                Emit raw JSON output
  --deep                Run LLM-powered deep analysis (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)
  --measure             Run empirical timing sweep (executes the target file in a sandbox)
  --generator <code>    JS expression (n) => args for the empirical sweep
                        Default: ${DEFAULT_GENERATOR}
  --lang <ext>          Override language detection (ts | js)
  -h, --help            Show this help
`;

export function parseCliArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    return { opts: { path: "", json: false, deep: false, measure: false }, helpText: USAGE };
  }

  if (args[0] !== "analyze") {
    return {
      opts: { path: "", json: false, deep: false, measure: false },
      error: `Unknown command '${args[0]}'. Use: complexity-analyzer analyze <path>`,
    };
  }

  const opts: CliOptions = { path: "", json: false, deep: false, measure: false };
  let i = 1;

  while (i < args.length) {
    const arg = args[i] as string;
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--deep") {
      opts.deep = true;
    } else if (arg === "--measure") {
      opts.measure = true;
    } else if (arg === "--generator") {
      i++;
      const gen = args[i];
      if (gen === undefined) return { opts, error: "--generator requires a value" };
      opts.generator = gen;
    } else if (arg === "--lang") {
      i++;
      const langVal = args[i];
      if (langVal === undefined) return { opts, error: "--lang requires a value (ts or js)" };
      opts.lang = langVal;
    } else if (!arg.startsWith("-")) {
      if (opts.path)
        return { opts, error: "Too many positional arguments. Pass a single file path or glob." };
      opts.path = arg;
    } else {
      return { opts, error: `Unknown option '${arg}'` };
    }
    i++;
  }

  if (!opts.path) {
    return { opts, error: "Missing required argument: <path>" };
  }

  return { opts };
}

// ── CLI runner (testable — returns result, never calls process.exit) ──────────

async function runOneFile(
  source: string,
  filePath: string,
  opts: CliOptions,
  measureFn: MeasureFn,
): Promise<{ result: AnalysisOutput; notices: string }> {
  const { deep, lang } = opts;
  const doMeasure = opts.measure ?? false;
  const generatorCode = opts.generator ?? DEFAULT_GENERATOR;
  let notices = "";

  let empiricalMap: Map<string, EmpiricalResult> | undefined;
  let measureResult: AnalysisOutput | undefined;

  if (doMeasure) {
    measureResult = await runMeasureAnalysis(source, filePath, generatorCode, lang, measureFn);
    empiricalMap = new Map(
      measureResult.units
        .filter((u) => u.measureStatus === "ok" && u.empiricalBigO !== undefined)
        .map((u) => [
          u.name,
          {
            bigO: u.empiricalBigO as string,
            rSquared: u.empiricalR2 ?? 0,
            confidence: (u.empiricalConfidence ?? "low") as "high" | "medium" | "low",
            reconciliation: (u.empiricalReconciliation ?? "inconclusive") as
              | "agree"
              | "diverge"
              | "inconclusive",
          },
        ]),
    );
  }

  let result: AnalysisOutput;

  if (deep) {
    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    if (!hasAnthropic && !hasOpenAI) {
      notices =
        "\nNote: --deep requires ANTHROPIC_API_KEY or OPENAI_API_KEY. Showing static analysis only.\n";
      result = measureResult ?? runAnalysis(source, filePath, lang);
    } else {
      result = await runDeepAnalysis(source, filePath, lang, undefined, empiricalMap);
      if (measureResult) {
        const byName = new Map(measureResult.units.map((u) => [u.name, u]));
        for (const u of result.units) {
          const m = byName.get(u.name);
          if (!m) continue;
          if (m.measureStatus !== undefined) u.measureStatus = m.measureStatus;
          if (m.empiricalBigO !== undefined) u.empiricalBigO = m.empiricalBigO;
          if (m.empiricalR2 !== undefined) u.empiricalR2 = m.empiricalR2;
          if (m.empiricalConfidence !== undefined) u.empiricalConfidence = m.empiricalConfidence;
          if (m.empiricalReconciliation !== undefined)
            u.empiricalReconciliation = m.empiricalReconciliation;
          if (m.measureError !== undefined) u.measureError = m.measureError;
        }
      }
    }
  } else {
    result = measureResult ?? runAnalysis(source, filePath, lang);
  }

  return { result, notices };
}

export async function runCli(
  opts: CliOptions,
  measureFn: MeasureFn = defaultMeasure,
): Promise<CliRunResult> {
  const { path: rawPath, json, deep } = opts;
  const doMeasure = opts.measure ?? false;
  const isGlob = /[*?{[]/.test(rawPath);
  const resolveSpec = isGlob ? { glob: rawPath } : { path: rawPath };

  const resolved = await resolveInput(resolveSpec);

  if (resolved.kind === "error") {
    const msg = `Error: ${resolved.message}\n`;
    return { output: json ? "" : msg, exitCode: 1 };
  }

  if (resolved.entries.length === 0) {
    if (json) {
      return {
        output: `${JSON.stringify({ files: [], message: "No matching files found." }, null, 2)}\n`,
        exitCode: 0,
      };
    }
    return { output: "No matching files found.\n", exitCode: 0 };
  }

  const allResults: AnalysisOutput[] = [];
  let allNotices = "";

  for (const entry of resolved.entries) {
    const { result, notices } = await runOneFile(
      entry.source,
      // Use the absolute path for measurement (it must exist on disk)
      isGlob ? entry.filename : resolve(rawPath),
      opts,
      measureFn,
    );
    allResults.push(result);
    if (notices) allNotices = notices; // same notice for all files
  }

  const hasParseError = allResults.some((r) => r.parseError);

  if (json) {
    const extras: Record<string, unknown> = {};
    if (deep) extras.deepEnabled = true;
    if (doMeasure) extras.measureEnabled = true;

    const payload =
      allResults.length === 1 ? { ...allResults[0], ...extras } : { files: allResults, ...extras };

    return {
      output: `${JSON.stringify(payload, null, 2)}\n`,
      exitCode: hasParseError ? 1 : 0,
    };
  }

  const parts = allResults.map((r) => formatHuman(r));
  return {
    output: `${parts.join("\n\n")}${allNotices}\n`,
    exitCode: hasParseError ? 1 : 0,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { opts, helpText, error } = parseCliArgs(process.argv);

  if (helpText) {
    process.stdout.write(helpText);
    process.exit(0);
  }

  if (error) {
    process.stderr.write(`Error: ${error}\n`);
    process.exit(1);
  }

  const { output, exitCode } = await runCli(opts);
  (exitCode === 0 ? process.stdout : process.stderr).write(output);
  process.exit(exitCode);
}

const selfPath = resolve(fileURLToPath(import.meta.url));
const argvPath = process.argv[1] ? resolve(process.argv[1]) : "";

if (selfPath === argvPath) {
  main().catch((err) => {
    process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
