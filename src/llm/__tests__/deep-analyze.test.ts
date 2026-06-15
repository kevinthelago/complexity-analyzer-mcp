import { describe, expect, it, vi } from "vitest";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { deepAnalyzeUnit } from "../index.js";
import type { LLMClient } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnit(src: string) {
  const parsed = parseCode(src, "input.ts");
  const unit = parsed.units[0];
  if (!unit) throw new Error("No units parsed");
  return unit;
}

function makeInput(src: string) {
  const unit = makeUnit(src);
  return { unit, staticResult: analyzeUnit(unit) };
}

function mockClient(response: string): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

function okResponse(overrides?: object): string {
  return JSON.stringify({
    verifiedTimeComplexity: "O(n)",
    verifiedSpaceComplexity: "O(1)",
    rationale: "Single pass over the array.",
    ...overrides,
  });
}

// ── llm_unavailable ───────────────────────────────────────────────────────────

describe("deepAnalyzeUnit — llm_unavailable", () => {
  it("returns static result with llm_unavailable when no client provided and no env key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const input = makeInput(
      "function sum(arr: number[]): number { let s = 0; for (const x of arr) s += x; return s; }",
    );
    const result = await deepAnalyzeUnit(input);
    expect(result.llmStatus).toBe("llm_unavailable");
    expect(result.timeComplexity).toBe(input.staticResult.timeComplexity);
    vi.unstubAllEnvs();
  });
});

// ── llm_error ─────────────────────────────────────────────────────────────────

describe("deepAnalyzeUnit — llm_error", () => {
  it("returns llm_error when the client throws", async () => {
    const client: LLMClient = { complete: vi.fn().mockRejectedValue(new Error("network")) };
    const input = makeInput("function add(a: number, b: number) { return a + b; }");
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("llm_error");
    expect(result.timeComplexity).toBe("O(1)"); // static result preserved
  });

  it("returns llm_error when the client returns invalid JSON", async () => {
    const client = mockClient("not json at all");
    const input = makeInput("function add(a: number, b: number) { return a + b; }");
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("llm_error");
  });

  it("returns llm_error when the JSON doesn't match the schema", async () => {
    const client = mockClient(JSON.stringify({ foo: "bar" }));
    const input = makeInput("function add(a: number, b: number) { return a + b; }");
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("llm_error");
  });

  it("returns llm_error when verifiedTimeComplexity is an invalid Big-O value", async () => {
    const client = mockClient(
      JSON.stringify({
        verifiedTimeComplexity: "O(sqrt n)", // not in the allowed set
        verifiedSpaceComplexity: "O(1)",
        rationale: "Linear scan.",
      }),
    );
    const input = makeInput("function add(a: number, b: number) { return a + b; }");
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("llm_error");
  });

  it("preserves the static result on error", async () => {
    const client: LLMClient = { complete: vi.fn().mockRejectedValue(new Error("timeout")) };
    const input = makeInput(`
      function bubbleSort(arr: number[]) {
        for (let i = 0; i < arr.length; i++)
          for (let j = 0; j < arr.length; j++) {}
        return arr;
      }
    `);
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("llm_error");
    expect(result.timeComplexity).toBe(input.staticResult.timeComplexity);
    expect(result.spaceComplexity).toBe(input.staticResult.spaceComplexity);
  });
});

// ── ok path ───────────────────────────────────────────────────────────────────

describe("deepAnalyzeUnit — ok path", () => {
  it("returns llmStatus ok and merges verified complexities", async () => {
    const client = mockClient(okResponse());
    const input = makeInput(
      "function sum(arr: number[]) { let s = 0; for (const x of arr) s += x; return s; }",
    );
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("ok");
    expect(result.verifiedTimeComplexity).toBe("O(n)");
    expect(result.verifiedSpaceComplexity).toBe("O(1)");
    expect(result.llmRationale).toMatch(/Single pass/);
  });

  it("preserves static result fields alongside LLM fields", async () => {
    const client = mockClient(okResponse());
    const input = makeInput(
      "function sum(arr: number[]) { let s = 0; for (const x of arr) s += x; return s; }",
    );
    const result = await deepAnalyzeUnit(input, client);
    expect(result.timeComplexity).toBe(input.staticResult.timeComplexity);
    expect(result.confidence).toBe(input.staticResult.confidence);
    expect(result.uncertainNodes).toEqual(input.staticResult.uncertainNodes);
  });

  it("attaches alternative when the LLM provides one", async () => {
    const client = mockClient(
      okResponse({
        alternative: {
          code: "function sumFast(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }",
          timeComplexity: "O(n)",
          spaceComplexity: "O(1)",
          rationale: "reduce is idiomatic and avoids explicit loop overhead.",
        },
      }),
    );
    const input = makeInput(
      "function sum(arr: number[]) { let s = 0; for (const x of arr) s += x; return s; }",
    );
    const result = await deepAnalyzeUnit(input, client);
    expect(result.alternative).toBeDefined();
    expect(result.alternative?.timeComplexityVerified).toBe(false);
    expect(result.alternative?.rationale).toMatch(/idiomatic/);
  });

  it("sets alternative to undefined when the LLM omits it", async () => {
    const client = mockClient(okResponse()); // no alternative key
    const input = makeInput("function add(a: number, b: number) { return a + b; }");
    const result = await deepAnalyzeUnit(input, client);
    expect(result.alternative).toBeUndefined();
  });

  it("strips markdown code fences the model may include", async () => {
    const client = mockClient("```json\n" + okResponse() + "\n```");
    const input = makeInput("function add(a: number, b: number) { return a + b; }");
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("ok");
  });

  it("accepts 'unknown' as a valid Big-O value", async () => {
    const client = mockClient(
      JSON.stringify({
        verifiedTimeComplexity: "unknown",
        verifiedSpaceComplexity: "unknown",
        rationale: "Cannot determine complexity without runtime profiling.",
      }),
    );
    const input = makeInput("function add(a: number, b: number) { return a + b; }");
    const result = await deepAnalyzeUnit(input, client);
    expect(result.llmStatus).toBe("ok");
    expect(result.verifiedTimeComplexity).toBe("unknown");
  });
});

// ── prompt content ────────────────────────────────────────────────────────────

describe("buildPrompt (via client.complete call arg)", () => {
  it("includes the function name and source code in the prompt", async () => {
    const complete = vi.fn().mockResolvedValue(okResponse());
    const client: LLMClient = { complete };
    const input = makeInput("function myFunc(x: number) { return x + 1; }");
    await deepAnalyzeUnit(input, client);
    const prompt = complete.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("myFunc");
    expect(prompt).toContain("return x + 1");
  });

  it("includes uncertain node descriptions in the prompt", async () => {
    const complete = vi.fn().mockResolvedValue(okResponse({ verifiedTimeComplexity: "O(n)" }));
    const client: LLMClient = { complete };
    // unknownFn is not in the cost-rules KB so it becomes an uncertain call
    const input = makeInput(`
      function wrapper(arr: string[]) {
        return arr.unknownMethod();
      }
    `);
    await deepAnalyzeUnit(input, client);
    const prompt = complete.mock.calls[0]?.[0] as string;
    // The prompt must contain some mention of the uncertain call
    expect(prompt.toLowerCase()).toMatch(/uncertain|unknown cost/);
  });
});
