import { KB_VERSION } from "../cost-rules/index.js";
import { analyzeHotspots } from "../hotspots/index.js";
import { parse } from "../parser/index.js";
import { analysisResultSchema } from "../schema/types.js";
import type { AnalysisResult, UnitResult } from "../schema/types.js";
import { staticPass } from "../static/index.js";
import type { PipelineOptions } from "./types.js";

const DEFAULT_STAGES = ["static", "hotspots"] as const;

/**
 * Runs the analysis pipeline over `source` and returns a validated AnalysisResult.
 *
 * Pipeline: parse → static → [llm] → hotspots → [suggest]
 * Stages not listed in options.stages are skipped; their fields take zero/default values.
 * parseError and no-units cases produce well-formed, non-throwing results.
 */
export function analyze(source: string, options: PipelineOptions = {}): AnalysisResult {
  const lang = options.lang ?? "typescript";
  const stages = options.stages ?? [...DEFAULT_STAGES];

  const parsed = parse(source, { lang });

  if (parsed.parseError !== undefined) {
    return analysisResultSchema.parse({
      units: [],
      parseError: parsed.parseError,
      notes: [],
      metadata: {
        analyzedAt: new Date().toISOString(),
        sourceLength: source.length,
        lang,
        kbVersion: KB_VERSION,
      },
    });
  }

  if (parsed.units.length === 0) {
    return analysisResultSchema.parse({
      units: [],
      notes: ["No analyzable units found in source"],
      metadata: {
        analyzedAt: new Date().toISOString(),
        sourceLength: source.length,
        lang,
        kbVersion: KB_VERSION,
      },
    });
  }

  const units: UnitResult[] = [];
  const notes: string[] = [];

  for (const parsedUnit of parsed.units) {
    if (!stages.includes("static")) continue;

    const staticResult = staticPass(parsedUnit, {
      typeInfoAvailable: parsed.typeInfoAvailable,
    });

    const hotspots = stages.includes("hotspots") ? analyzeHotspots(staticResult) : [];

    units.push({
      name: parsedUnit.name,
      line: parsedUnit.line,
      time: staticResult.time,
      space: staticResult.space,
      confidence: staticResult.confidence,
      hotspots,
      suggestions: [],
      uncertainNodes: staticResult.uncertainNodes,
      analyzedBy: "static",
    });
  }

  return analysisResultSchema.parse({
    units,
    notes,
    metadata: {
      analyzedAt: new Date().toISOString(),
      sourceLength: source.length,
      lang,
      kbVersion: KB_VERSION,
    },
  });
}
