import type { LLMClient } from "./types.js";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
/** Max tokens reserved for the LLM response (JSON verdict). */
const MAX_TOKENS = 1024;
/** One automatic retry on transient errors (SDK default). */
const MAX_RETRIES = 1;

/**
 * Create a real Anthropic-backed LLM client.
 * The SDK is imported dynamically so bundles that never call this function
 * don't pay the load cost when ANTHROPIC_API_KEY is absent.
 */
export function createAnthropicClient(apiKey: string, model = DEFAULT_MODEL): LLMClient {
  return {
    async complete(prompt: string): Promise<string> {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const sdk = new Anthropic({ apiKey, maxRetries: MAX_RETRIES });

      const response = await sdk.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      });

      const block = response.content[0];
      if (!block || block.type !== "text") {
        throw new Error("Unexpected response content type from Anthropic API");
      }
      return block.text;
    },
  };
}

/**
 * Resolve a client from process environment variables.
 * Returns undefined when ANTHROPIC_API_KEY is not set (llm_unavailable path).
 */
export function resolveClientFromEnv(): LLMClient | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;
  const model = process.env.COMPLEXITY_MODEL ?? DEFAULT_MODEL;
  return createAnthropicClient(apiKey, model);
}
