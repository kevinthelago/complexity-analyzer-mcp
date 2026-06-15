/**
 * Live integration smoke test — only runs when ANTHROPIC_API_KEY is set.
 * Excluded from the default CI gate via the `skipIf` guard.
 *
 * Run manually with:
 *   ANTHROPIC_API_KEY=<key> pnpm test src/llm/__tests__/smoke.test.ts
 */
import { describe, expect, it } from "vitest";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { deepAnalyzeUnit } from "../index.js";

const SKIP = !process.env.ANTHROPIC_API_KEY;

describe.skipIf(SKIP)("deepAnalyzeUnit — live smoke test (requires ANTHROPIC_API_KEY)", () => {
  it("analyses a simple O(n) function end-to-end", async () => {
    const src = `
      function linearSearch(arr: number[], target: number): number {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] === target) return i;
        }
        return -1;
      }
    `;
    const parsed = parseCode(src, "input.ts");
    const unit = parsed.units[0];
    if (!unit) throw new Error("No units parsed");

    const result = await deepAnalyzeUnit({ unit, staticResult: analyzeUnit(unit) });

    expect(result.llmStatus).toBe("ok");
    expect(result.verifiedTimeComplexity).toBeDefined();
    expect(result.llmRationale).toBeDefined();
  }, 30_000);
});
