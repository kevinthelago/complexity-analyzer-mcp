import { resolveClientFromEnv } from "./client.js";
import { buildPrompt } from "./prompt.js";
import { llmOutputSchema } from "./schema.js";
import type { DeepAnalyzeInput, DeepAnalyzeResult, LLMClient } from "./types.js";

export {
  createAnthropicClient,
  createOpenAIClient,
  createStubClient,
  resolveClientFromEnv,
} from "./client.js";
export { llmOutputSchema } from "./schema.js";
export type {
  DeepAnalyzeInput,
  DeepAnalyzeResult,
  LLMAlternative,
  LLMClient,
  LLMStatus,
} from "./types.js";

/**
 * Run the LLM refinement pass on top of a static analysis result.
 *
 * - If no API key is available, returns the static result with llmStatus "llm_unavailable".
 * - On API or parse errors, returns the static result with llmStatus "llm_error".
 * - Never throws; the static result is always preserved.
 *
 * @param input  The analysable unit + its static complexity result.
 * @param client Optional injected client; defaults to the env-resolved Anthropic client.
 */
export async function deepAnalyzeUnit(
  input: DeepAnalyzeInput,
  client?: LLMClient,
): Promise<DeepAnalyzeResult> {
  const resolvedClient = client ?? resolveClientFromEnv();

  if (!resolvedClient) {
    return { ...input.staticResult, llmStatus: "llm_unavailable" };
  }

  let raw: string;
  try {
    const prompt = buildPrompt(
      input.unit,
      input.staticResult,
      input.hotspots,
      input.suggestions,
      input.empirical,
    );
    raw = await resolvedClient.complete(prompt);
  } catch {
    return { ...input.staticResult, llmStatus: "llm_error" };
  }

  // Strip markdown code fences the model sometimes adds despite instructions.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ...input.staticResult, llmStatus: "llm_error" };
  }

  const validated = llmOutputSchema.safeParse(parsed);
  if (!validated.success) {
    return { ...input.staticResult, llmStatus: "llm_error" };
  }

  const { verifiedTimeComplexity, verifiedSpaceComplexity, rationale, alternative } =
    validated.data;

  const base: DeepAnalyzeResult = {
    ...input.staticResult,
    llmStatus: "ok",
    verifiedTimeComplexity,
    verifiedSpaceComplexity,
    llmRationale: rationale,
  };

  if (alternative) {
    base.alternative = {
      code: alternative.code,
      timeComplexity: alternative.timeComplexity,
      timeComplexityVerified: false,
      spaceComplexity: alternative.spaceComplexity,
      rationale: alternative.rationale,
    };
  }

  return base;
}
