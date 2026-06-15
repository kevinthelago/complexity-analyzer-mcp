import { z } from "zod";

export const UncertainNodeSchema = z.object({
  description: z.string(),
  line: z.number().int().positive(),
  col: z.number().int().positive(),
});

export const RecursionInfoSchema = z.object({
  kind: z.enum(["linear", "divide-and-conquer", "exponential", "uncertain"]),
  rationale: z.string(),
});

export const HotspotSchema = z.object({
  line: z.number().int().positive(),
  col: z.number().int().positive(),
  snippet: z.string(),
  bigO: z.string(),
  reason: z.string(),
  uncertain: z.boolean(),
});

export const UnitResultSchema = z.object({
  name: z.string(),
  kind: z.enum(["function", "method", "arrow", "constructor"]),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  timeComplexity: z.string(),
  spaceComplexity: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  uncertainNodes: z.array(UncertainNodeSchema),
  recursion: RecursionInfoSchema.optional(),
  hotspots: z.array(HotspotSchema),
  analyzedBy: z.enum(["static", "llm"]),
});

export const ParseErrorSchema = z.object({
  message: z.string(),
});

export const AnalysisResultSchema = z.object({
  success: z.boolean(),
  units: z.array(UnitResultSchema),
  parseError: ParseErrorSchema.optional(),
  llmUnavailable: z.string().optional(),
  metadata: z.object({
    lang: z.string(),
    kbVersion: z.string(),
  }),
});

export type UncertainNodeOut = z.infer<typeof UncertainNodeSchema>;
export type RecursionInfoOut = z.infer<typeof RecursionInfoSchema>;
export type HotspotOut = z.infer<typeof HotspotSchema>;
export type UnitResult = z.infer<typeof UnitResultSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
