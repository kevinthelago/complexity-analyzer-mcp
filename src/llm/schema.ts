import { z } from "zod";

const BIG_O_VALUES = [
  "O(1)",
  "O(log n)",
  "O(n)",
  "O(n log n)",
  "O(n²)",
  "O(n³)",
  "O(2ⁿ)",
  "unknown",
] as const;

const bigO = z.string().refine((v) => BIG_O_VALUES.includes(v as (typeof BIG_O_VALUES)[number]), {
  message: `Must be one of: ${BIG_O_VALUES.join(", ")}`,
});

export const llmAlternativeSchema = z.object({
  code: z.string().min(1),
  timeComplexity: bigO,
  spaceComplexity: bigO,
  rationale: z.string().min(1),
});

/** Zod schema validating the raw JSON the LLM is expected to return. */
export const llmOutputSchema = z.object({
  verifiedTimeComplexity: bigO,
  verifiedSpaceComplexity: bigO,
  rationale: z.string().min(1),
  alternative: llmAlternativeSchema.optional(),
});

export type LLMOutput = z.infer<typeof llmOutputSchema>;
