import { KB_VERSION } from "../cost-rules/index.js";
import { findHotspots } from "../hotspots/index.js";
import { parseCode } from "../parser/index.js";
import type { AnalyzableUnit } from "../parser/types.js";
import type { AnalysisResult, UnitResult } from "../schema/index.js";
import { AnalysisResultSchema } from "../schema/index.js";
import { analyzeUnit } from "../static/index.js";

export type { AnalysisResult, UnitResult } from "../schema/index.js";

export interface AnalyzeOptions {
  /** File name hint used for language detection and ts-morph (default: "input.ts"). */
  filename?: string;
  /** Override detected language ("ts" | "js"). */
  lang?: string;
  /**
   * Which engine stages to run.
   * - "static": time/space/confidence (always run)
   * - "hotspots": identify dominant-cost constructs (default on)
   * Omit or pass undefined to run all default stages.
   */
  stages?: Array<"static" | "hotspots">;
}

function detectLang(filename: string, override?: string): string {
  if (override) return override;
  if (filename.endsWith(".js") || filename.endsWith(".jsx")) return "js";
  if (filename.endsWith(".ts") || filename.endsWith(".tsx")) return "ts";
  return "ts";
}

function buildUnitResult(unit: AnalyzableUnit, stages: Array<"static" | "hotspots">): UnitResult {
  const staticResult = analyzeUnit(unit);
  const hotspots = stages.includes("hotspots") ? findHotspots(unit, staticResult) : [];

  return {
    name: unit.name,
    kind: unit.kind,
    startLine: unit.startLine,
    endLine: unit.endLine,
    timeComplexity: staticResult.timeComplexity,
    spaceComplexity: staticResult.spaceComplexity,
    confidence: staticResult.confidence,
    uncertainNodes: staticResult.uncertainNodes,
    recursion: staticResult.recursion,
    hotspots,
    analyzedBy: "static",
  };
}

/**
 * Analyse TypeScript/JavaScript source through the engine pipeline.
 *
 * Pure function — identical input always produces identical output.
 * Never throws; parse errors and empty-unit cases return well-formed results.
 */
export function analyze(source: string, options: AnalyzeOptions = {}): AnalysisResult {
  const filename = options.filename ?? "input.ts";
  const lang = detectLang(filename, options.lang);
  const stages: Array<"static" | "hotspots"> = options.stages ?? ["static", "hotspots"];

  const parseResult = parseCode(source, filename);
  const metadata = { lang, kbVersion: KB_VERSION };

  if (!parseResult.success) {
    return AnalysisResultSchema.parse({
      success: false,
      units: [],
      parseError: parseResult.parseError,
      metadata,
    });
  }

  const units = parseResult.units.map((unit) => buildUnitResult(unit, stages));

  return AnalysisResultSchema.parse({
    success: true,
    units,
    metadata,
  });
}
