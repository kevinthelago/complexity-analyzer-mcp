import { z } from "zod";

export const BIG_O_VALUES = [
  "O(1)",
  "O(log n)",
  "O(n)",
  "O(n log n)",
  "O(n^2)",
  "O(n^3)",
  "O(2^n)",
  "O(n!)",
  "O(n*m)",
  "uncertain",
] as const;

export const bigOSchema = z.enum(BIG_O_VALUES);
export type BigO = z.infer<typeof bigOSchema>;

/** Numeric weight for Big-O ordering (higher = costlier; uncertain = -1). */
export const BIG_O_WEIGHT: Record<BigO, number> = {
  "O(1)": 0,
  "O(log n)": 1,
  "O(n)": 2,
  "O(n log n)": 3,
  "O(n^2)": 4,
  "O(n*m)": 4.5,
  "O(n^3)": 5,
  "O(2^n)": 6,
  "O(n!)": 7,
  uncertain: -1,
};

export const confidenceSchema = z.enum(["high", "medium", "low", "uncertain"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const parseErrorSchema = z.object({
  message: z.string(),
  line: z.number().int().positive().optional(),
  column: z.number().int().nonnegative().optional(),
});
export type ParseError = z.infer<typeof parseErrorSchema>;

export const uncertainNodeSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
  reason: z.string(),
});
export type UncertainNode = z.infer<typeof uncertainNodeSchema>;

export const hotspotSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
  snippet: z.string(),
  complexity: bigOSchema,
  reason: z.string(),
  uncertain: z.boolean().optional(),
});
export type Hotspot = z.infer<typeof hotspotSchema>;

export const unitResultSchema = z.object({
  name: z.string(),
  line: z.number().int().positive(),
  time: bigOSchema,
  space: bigOSchema,
  confidence: confidenceSchema,
  hotspots: z.array(hotspotSchema),
  suggestions: z.array(z.string()),
  uncertainNodes: z.array(uncertainNodeSchema),
  analyzedBy: z.enum(["static", "llm"]),
});
export type UnitResult = z.infer<typeof unitResultSchema>;

export const analysisMetadataSchema = z.object({
  analyzedAt: z.string(),
  sourceLength: z.number().int().nonnegative(),
  lang: z.string(),
  kbVersion: z.string(),
});
export type AnalysisMetadata = z.infer<typeof analysisMetadataSchema>;

export const analysisResultSchema = z.object({
  units: z.array(unitResultSchema),
  parseError: parseErrorSchema.optional(),
  notes: z.array(z.string()),
  metadata: analysisMetadataSchema,
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
