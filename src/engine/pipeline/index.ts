import { KB_VERSION } from "../cost-rules/index.js";
import { findHotspots } from "../hotspots/index.js";
import { resolveInput } from "../input/index.js";
import type { InputSpec } from "../input/index.js";
import { parseCode } from "../parser/index.js";
import {
  type AnalysisResult,
  AnalysisResultSchema,
  type SuggestionResult,
  type UnitResult,
} from "../schema/index.js";
import { analyzeUnit } from "../static/index.js";
import { suggestOptimizations } from "../suggest/index.js";
import type { OptimizationSuggestion } from "../suggest/index.js";

export type { AnalysisResult, SuggestionResult, UnitResult } from "../schema/index.js";

// ── Stage flags ───────────────────────────────────────────────────────────────

export type StageId = "hotspots" | "suggestions";

export interface PipelineOptions {
  filename?: string;
  /**
   * Which optional stages to include. Defaults to ["hotspots", "suggestions"].
   */
  stages?: ReadonlyArray<StageId>;
  /**
   * Optional LLM reasoner injection point. When provided it is called per-unit
   * after the static pass; its suggestions are merged into the unit result.
   */
  llmReasoner?: (unit: UnitResult) => Promise<string[]>;
}

const DEFAULT_STAGES: ReadonlyArray<StageId> = ["hotspots", "suggestions"];

// ── Suggestion bridge ─────────────────────────────────────────────────────────

/** Convert the suggest engine's internal format to the canonical SuggestionResult shape. */
function bridgeSuggestion(s: OptimizationSuggestion): SuggestionResult {
  return {
    ruleId: s.pattern,
    description: s.description,
    rationale: s.rationale,
    line: s.location.startLine,
    col: 1,
    beforeBigO: s.currentComplexity,
    afterBigO: s.projectedComplexity,
    ...(s.assumptions !== undefined ? { assumptions: s.assumptions } : {}),
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full (or partial) analysis pipeline on TypeScript/JavaScript source.
 *
 * Stages always run: parse → static
 * Optional stages (controlled via options.stages): hotspots, suggestions
 *
 * Returns a validated AnalysisResult — never throws on malformed source.
 */
export function runPipeline(source: string, options?: PipelineOptions): AnalysisResult {
  const filename = options?.filename ?? "input.ts";
  const stages = options?.stages ?? DEFAULT_STAGES;
  const runHotspots = stages.includes("hotspots");
  const runSuggestions = stages.includes("suggestions");

  const analyzedBy: string[] = ["parse"];
  const notes: string[] = [];

  // ── Stage 1: parse ────────────────────────────────────────────────────────

  const parsed = parseCode(source, filename);

  if (!parsed.success) {
    return AnalysisResultSchema.parse({
      lang: langFromFilename(filename),
      kbVersion: KB_VERSION,
      analyzedBy,
      units: [],
      parseError: parsed.parseError?.message ?? "Unknown parse error",
      notes,
    });
  }

  if (parsed.units.length === 0) {
    notes.push("no_analyzable_units");
    return AnalysisResultSchema.parse({
      lang: langFromFilename(filename),
      kbVersion: KB_VERSION,
      analyzedBy,
      units: [],
      notes,
    });
  }

  // ── Stage 2: static ───────────────────────────────────────────────────────

  analyzedBy.push("static");

  const unitResults: UnitResult[] = parsed.units.map((unit) => {
    const staticResult = analyzeUnit(unit);
    const hotspots = runHotspots ? findHotspots(unit, staticResult) : [];
    const suggestions = runSuggestions
      ? suggestOptimizations(unit, staticResult).suggestions.map(bridgeSuggestion)
      : undefined;

    return {
      name: unit.name,
      kind: unit.kind,
      startLine: unit.startLine,
      endLine: unit.endLine,
      timeComplexity: staticResult.timeComplexity,
      spaceComplexity: staticResult.spaceComplexity,
      confidence: staticResult.confidence,
      hotspots,
      uncertainNodes: staticResult.uncertainNodes,
      recursion: staticResult.recursion,
      ...(suggestions !== undefined && suggestions.length > 0 ? { suggestions } : {}),
    };
  });

  if (runHotspots) analyzedBy.push("hotspots");
  if (runSuggestions) analyzedBy.push("suggestions");

  // ── Validate & return ────────────────────────────────────────────────────

  return AnalysisResultSchema.parse({
    lang: langFromFilename(filename),
    kbVersion: KB_VERSION,
    analyzedBy,
    units: unitResults,
    notes,
  });
}

// ── analyzeSource — input-adapter entry point ─────────────────────────────────

/**
 * Orchestrate the full engine pipeline over an InputSpec (code string, file
 * path, or glob pattern). Returns one AnalysisResult per resolved source file.
 *
 * For a CodeInput this is always a single-element array.
 * For a GlobInput with no matches the array is empty (not an error).
 * Parse errors are surfaced inline in each result's parseError field.
 */
export async function analyzeSource(
  input: InputSpec,
  options?: Omit<PipelineOptions, "filename">,
): Promise<AnalysisResult[]> {
  const resolved = await resolveInput(input);

  if (resolved.kind === "error") {
    // Return a synthetic error result rather than throwing.
    return [
      AnalysisResultSchema.parse({
        lang: "unknown",
        kbVersion: KB_VERSION,
        analyzedBy: [],
        units: [],
        parseError: resolved.message,
        notes: [],
      }),
    ];
  }

  return resolved.entries.map(({ source, filename }) =>
    runPipeline(source, { ...options, filename }),
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function langFromFilename(filename: string): string {
  if (filename.endsWith(".tsx")) return "tsx";
  if (filename.endsWith(".ts")) return "typescript";
  if (filename.endsWith(".jsx")) return "jsx";
  if (filename.endsWith(".js") || filename.endsWith(".mjs") || filename.endsWith(".cjs"))
    return "javascript";
  return "unknown";
}
