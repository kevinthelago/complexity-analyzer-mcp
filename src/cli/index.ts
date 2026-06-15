import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeUnit, parseCode } from "../engine/index.js";
import type { RecursionInfo, UncertainNode } from "../engine/index.js";

// ── Public types ─────────────────────────────────────────────────────────────

export interface CliOptions {
  path: string;
  json: boolean;
  deep: boolean;
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectLang(filePath: string, langOverride?: string): string {
  if (langOverride) return langOverride;
  const ext = extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "ts";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "js";
  return "ts";
}

function parserFilename(filePath: string, lang: string): string {
  // ts-morph uses the filename extension to decide whether to enable type-checking
  const base = filePath.split(/[\\/]/).at(-1) ?? "input";
  const ext = extname(base);
  if (ext) return base;
  return lang === "js" ? `${base}.js` : `${base}.ts`;
}

// ── Analysis runner (thin engine orchestration — no analysis logic here) ─────

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

    if (u.recursion) {
      lines.push(`  Recursion:  ${u.recursion.kind} — ${u.recursion.rationale}`);
    }

    if (u.uncertainNodes.length > 0) {
      lines.push("  Uncertain:");
      for (const n of u.uncertainNodes) {
        lines.push(`    ${n.line}:${n.col}  ${n.description}`);
      }
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

Options:
  --json        Emit raw JSON output
  --deep        Run LLM-powered deep analysis (requires ANTHROPIC_API_KEY)
  --lang <ext>  Override language detection (ts | js)
  -h, --help    Show this help
`;

export function parseCliArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    return { opts: { path: "", json: false, deep: false }, helpText: USAGE };
  }

  if (args[0] !== "analyze") {
    return {
      opts: { path: "", json: false, deep: false },
      error: `Unknown command '${args[0]}'. Use: complexity-analyzer analyze <path>`,
    };
  }

  const opts: CliOptions = { path: "", json: false, deep: false };
  let i = 1;

  while (i < args.length) {
    const arg = args[i] as string;
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--deep") {
      opts.deep = true;
    } else if (arg === "--lang") {
      i++;
      const langVal = args[i];
      if (langVal === undefined) return { opts, error: "--lang requires a value (ts or js)" };
      opts.lang = langVal;
    } else if (!arg.startsWith("-")) {
      if (opts.path)
        return { opts, error: "Too many positional arguments. Pass a single file path." };
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

const GLOB_CHARS = /[*?{[]/;

export async function runCli(opts: CliOptions): Promise<CliRunResult> {
  const { path: rawPath, json, deep, lang } = opts;

  if (GLOB_CHARS.test(rawPath)) {
    return {
      output: "Error: glob patterns are not supported. Pass a single file path.\n",
      exitCode: 1,
    };
  }

  const resolvedPath = resolve(rawPath);

  if (!existsSync(resolvedPath)) {
    return { output: `Error: file not found: ${rawPath}\n`, exitCode: 1 };
  }

  let isDir: boolean;
  try {
    isDir = statSync(resolvedPath).isDirectory();
  } catch {
    return { output: `Error: cannot stat ${rawPath}\n`, exitCode: 1 };
  }

  if (isDir) {
    return {
      output: `Error: ${rawPath} is a directory. Pass a single file path.\n`,
      exitCode: 1,
    };
  }

  let source: string;
  try {
    source = readFileSync(resolvedPath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `Error: cannot read ${rawPath}: ${msg}\n`, exitCode: 1 };
  }

  // --deep: LLM path (CA-11) not yet implemented; degrade gracefully
  let deepNotice = "";
  if (deep) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      deepNotice = "\nNote: --deep requires ANTHROPIC_API_KEY. Showing static analysis only.\n";
    } else {
      deepNotice = "\nNote: LLM deep analysis not yet available in this build.\n";
    }
  }

  const result = runAnalysis(source, resolvedPath, lang);

  if (result.parseError && !json) {
    return { output: `Error: ${result.parseError}\n`, exitCode: 1 };
  }

  if (json) {
    const payload = deep ? { ...result, deepAnalysis: null } : result;
    const output = `${JSON.stringify(payload, null, 2)}\n`;
    return { output, exitCode: result.parseError ? 1 : 0 };
  }

  const output = `${formatHuman(result)}${deepNotice}\n`;
  return { output, exitCode: result.parseError ? 1 : 0 };
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

// Only execute when run as the CLI entry point, not when imported by tests
const selfPath = resolve(fileURLToPath(import.meta.url));
const argvPath = process.argv[1] ? resolve(process.argv[1]) : "";

if (selfPath === argvPath) {
  main().catch((err) => {
    process.stderr.write(`Unexpected error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
