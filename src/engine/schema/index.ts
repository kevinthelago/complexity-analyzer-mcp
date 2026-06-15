import { z } from "zod";

// ── Leaf schemas ─────────────────────────────────────────────────────────────

export const HotspotSchema = z.object({
  line: z.number().int().positive(),
  col: z.number().int().positive(),
  snippet: z.string(),
  bigO: z.string(),
  reason: z.string(),
  uncertain: z.boolean(),
});

export const UncertainNodeSchema = z.object({
  description: z.string(),
  line: z.number().int().positive(),
  col: z.number().int().positive(),
});

export const RecursionInfoSchema = z.object({
  kind: z.enum(["linear", "divide-and-conquer", "exponential", "uncertain"]),
  rationale: z.string(),
});

// ── Per-unit result ───────────────────────────────────────────────────────────

export const UnitResultSchema = z.object({
  name: z.string(),
  kind: z.enum(["function", "method", "arrow", "constructor"]),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  timeComplexity: z.string(),
  spaceComplexity: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  hotspots: z.array(HotspotSchema),
  uncertainNodes: z.array(UncertainNodeSchema),
  recursion: RecursionInfoSchema.optional(),
  suggestions: z.array(z.string()).optional(),
});

// ── Top-level result ──────────────────────────────────────────────────────────

export const AnalysisResultSchema = z.object({
  lang: z.string(),
  kbVersion: z.string(),
  /** Stages that actually ran, in order — e.g. ["parse", "static", "hotspots"]. */
  analyzedBy: z.array(z.string()),
  units: z.array(UnitResultSchema),
  /** Populated when the source file could not be parsed at all. */
  parseError: z.string().optional(),
  /** Non-fatal warnings, e.g. "llm_unavailable", "no_analyzable_units". */
  notes: z.array(z.string()),
});

// ── Inferred types ─────────────────────────────────────────────────────────────

export type HotspotResult = z.infer<typeof HotspotSchema>;
export type UncertainNodeResult = z.infer<typeof UncertainNodeSchema>;
export type RecursionInfoResult = z.infer<typeof RecursionInfoSchema>;
export type UnitResult = z.infer<typeof UnitResultSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
