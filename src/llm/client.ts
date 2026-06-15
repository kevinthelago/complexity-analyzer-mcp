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
 * Create a client for any OpenAI Chat Completions-compatible endpoint.
 *
 * Targets servers that expose `POST /v1/chat/completions` (e.g. OpenAI,
 * Azure OpenAI, Ollama, llama.cpp server, LM Studio).
 *
 * @param apiKey  Bearer token; use a placeholder for unauthenticated local servers.
 * @param model   Model name/id as required by the target server.
 * @param baseUrl Base URL without a trailing slash (default: `https://api.openai.com`).
 */
export function createOpenAIClient(
  apiKey: string,
  model: string,
  baseUrl = "https://api.openai.com",
): LLMClient {
  return {
    async complete(prompt: string): Promise<string> {
      const url = `${baseUrl}/v1/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`OpenAI-compatible API error ${res.status}: ${body}`);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const text = json.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("OpenAI-compatible API returned no content");
      }
      return text;
    },
  };
}

/**
 * Create a deterministic stub client that always returns the given text.
 * Use in tests to avoid any network calls.
 */
export function createStubClient(response: string): LLMClient {
  return { complete: async () => response };
}

/**
 * Resolve a client from process environment variables.
 * Returns undefined when ANTHROPIC_API_KEY is not set (llm_unavailable path).
 *
 * Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL / COMPLEXITY_OPENAI_MODEL)
 * to use an OpenAI-compatible endpoint instead.
 */
export function resolveClientFromEnv(): LLMClient | undefined {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = process.env.COMPLEXITY_MODEL ?? DEFAULT_MODEL;
    return createAnthropicClient(anthropicKey, model);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.COMPLEXITY_OPENAI_MODEL ?? "gpt-4o-mini";
    const baseUrl = process.env.OPENAI_BASE_URL;
    return createOpenAIClient(openaiKey, model, baseUrl);
  }

  return undefined;
}
