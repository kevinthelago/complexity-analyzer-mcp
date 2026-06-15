import { z } from "zod";

// ── Leaf schemas ─────────────────────────────────────────────────────────────

export const HotspotSchema = z.object({
  kind: z.enum(["loop-nest", "costly-call", "recursion", "allocation", "unknown"]),
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

export const SuggestionSchema = z.object({
  /** Stable rule identifier (e.g. "membership-in-loop"). */
  ruleId: z.string(),
  /** Short description of the issue and the recommended change. */
  description: z.string(),
  /** Why the fix is safe and what it achieves. */
  rationale: z.string(),
  /** Source location where the pattern was detected. */
  line: z.number().int().positive(),
  col: z.number().int().positive(),
  /** Estimated complexity before the optimization. */
  beforeBigO: z.string(),
  /** Estimated complexity after the optimization (or "unknown" when unquantifiable). */
  afterBigO: z.string(),
  /** Behavioural assumption, if any. */
  assumptions: z.string().optional(),
});

export const EmpiricalResultSchema = z.object({
  bigO: z.string(),
  rSquared: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  reconciliation: z.enum(["agree", "diverge", "inconclusive"]),
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
  suggestions: z.array(SuggestionSchema).optional(),
  empirical: EmpiricalResultSchema.optional(),
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
export type SuggestionResult = z.infer<typeof SuggestionSchema>;
export type EmpiricalResult = z.infer<typeof EmpiricalResultSchema>;
export type UnitResult = z.infer<typeof UnitResultSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
