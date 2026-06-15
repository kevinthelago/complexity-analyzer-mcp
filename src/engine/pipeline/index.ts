import { KB_VERSION } from "../cost-rules/index.js";
import { findHotspots } from "../hotspots/index.js";
import { parseCode } from "../parser/index.js";
import { type AnalysisResult, AnalysisResultSchema, type UnitResult } from "../schema/index.js";
import { analyzeUnit } from "../static/index.js";

export type { AnalysisResult, UnitResult } from "../schema/index.js";

// ── Stage flags ───────────────────────────────────────────────────────────────

export type StageId = "hotspots" | "suggestions";

export interface PipelineOptions {
  filename?: string;
  /**
   * Which optional stages to include. Defaults to ["hotspots"].
   * "suggestions" is reserved for the static suggestion generator (issue #9);
   * when requested but not yet available it is silently skipped and a note added.
   */
  stages?: ReadonlyArray<StageId>;
  /**
   * Optional LLM reasoner injection point. When provided it is called per-unit
   * after the static pass; its suggestions are merged into the unit result.
   */
  llmReasoner?: (unit: UnitResult) => Promise<string[]>;
}

const DEFAULT_STAGES: ReadonlyArray<StageId> = ["hotspots"];

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the full (or partial) analysis pipeline on TypeScript/JavaScript source.
 *
 * Stages always run: parse → static
 * Optional stages (controlled via options.stages): hotspots
 * Reserved stage: suggestions (no-op until issue #9 lands)
 *
 * Returns a validated AnalysisResult — never throws on malformed source.
 */
export function runPipeline(source: string, options?: PipelineOptions): AnalysisResult {
  const filename = options?.filename ?? "input.ts";
  const stages = options?.stages ?? DEFAULT_STAGES;
  const runHotspots = stages.includes("hotspots");

  const analyzedBy: string[] = ["parse"];
  const notes: string[] = [];

  // ── Stage 1: parse ────────────────────────────────────────────────────────

  const parsed = parseCode(source, filename);

  if (!parsed.success) {
    const result = AnalysisResultSchema.parse({
      lang: langFromFilename(filename),
      kbVersion: KB_VERSION,
      analyzedBy,
      units: [],
      parseError: parsed.parseError?.message ?? "Unknown parse error",
      notes,
    });
    return result;
  }

  if (parsed.units.length === 0) {
    notes.push("no_analyzable_units");
    const result = AnalysisResultSchema.parse({
      lang: langFromFilename(filename),
      kbVersion: KB_VERSION,
      analyzedBy,
      units: [],
      notes,
    });
    return result;
  }

  // ── Stage 2: static ───────────────────────────────────────────────────────

  analyzedBy.push("static");

  const unitResults: UnitResult[] = parsed.units.map((unit) => {
    const staticResult = analyzeUnit(unit);
    const hotspots = runHotspots ? findHotspots(unit, staticResult) : [];

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
    };
  });

  if (runHotspots) analyzedBy.push("hotspots");

  if (stages.includes("suggestions")) {
    notes.push("suggestions_unavailable: stage not yet implemented");
  }

  // ── Validate & return ────────────────────────────────────────────────────

  return AnalysisResultSchema.parse({
    lang: langFromFilename(filename),
    kbVersion: KB_VERSION,
    analyzedBy,
    units: unitResults,
    notes,
  });
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
