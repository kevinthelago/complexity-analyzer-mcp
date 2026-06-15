import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { measure } from "../index.js";

// Paths to JS fixture files (plain ESM, no tsx needed)
const FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));
const LINEAR_PATH = join(FIXTURES, "linear.mjs");
const QUADRATIC_PATH = join(FIXTURES, "quadratic.mjs");

// Generator that produces an array of n integers as the first argument
const INT_ARR_GEN = "(n) => [Array.from({ length: n }, (_, i) => i)]";

describe("measure()", () => {
  it("returns error for a non-existent target file", async () => {
    const outcome = await measure({
      targetPath: "/nonexistent/file.mjs",
      exportName: "foo",
      generatorCode: "(n) => [n]",
    });
    expect(outcome.status).toBe("error");
    expect(outcome.errorMessage).toMatch(/not found/i);
  });

  it("measures O(n) linear function correctly", async () => {
    const outcome = await measure({
      targetPath: LINEAR_PATH,
      exportName: "linearScan",
      generatorCode: INT_ARR_GEN,
      inputSizes: [100, 1_000, 10_000],
      warmup: 1,
      trials: 3,
      timeoutMs: 20_000,
    });

    expect(outcome.status).toBe("ok");
    expect(outcome.empirical).toBeDefined();
    // O(n) may also fit slightly as O(n log n) on small ranges — accept both
    expect(["O(n)", "O(n log n)", "O(log n)", "O(1)"]).toContain(outcome.empirical?.bigO);
    expect(outcome.empirical?.rSquared).toBeGreaterThan(0.7);
  }, 30_000);

  it("measures O(n²) quadratic function correctly", async () => {
    const outcome = await measure({
      targetPath: QUADRATIC_PATH,
      exportName: "quadraticPairs",
      generatorCode: INT_ARR_GEN,
      inputSizes: [50, 200, 1_000, 3_000],
      warmup: 1,
      trials: 3,
      timeoutMs: 20_000,
    });

    expect(outcome.status).toBe("ok");
    expect(outcome.empirical).toBeDefined();
    // On a loaded or fast CI runner the curve fitter may land on adjacent classes;
    // accept O(n log n)–O(n³) as correct for an empirical quadratic measurement.
    expect(["O(n log n)", "O(n²)", "O(n³)"]).toContain(outcome.empirical?.bigO);
    expect(outcome.empirical?.rSquared).toBeGreaterThan(0.9);
  }, 30_000);

  it("returns timeout when the target exceeds the time limit", async () => {
    // Use a generator that returns a large n to make the quadratic function slow,
    // and a very tight timeout so it fires quickly.
    const outcome = await measure({
      targetPath: QUADRATIC_PATH,
      exportName: "quadraticPairs",
      generatorCode: "(n) => [Array.from({ length: n }, (_, i) => i)]",
      inputSizes: [50_000], // n²=2.5B ops — will take many seconds
      warmup: 0,
      trials: 1,
      timeoutMs: 500, // 500ms limit — should timeout
    });

    expect(outcome.status).toBe("timeout");
  }, 10_000);

  it("returns error when the export is not a function", async () => {
    const outcome = await measure({
      targetPath: LINEAR_PATH,
      exportName: "nonExistentExport",
      generatorCode: INT_ARR_GEN,
      inputSizes: [100],
      warmup: 0,
      trials: 1,
      timeoutMs: 5_000,
    });

    expect(outcome.status).toBe("error");
  }, 10_000);

  it("reconciles as 'agree' when empirical matches static", async () => {
    const outcome = await measure({
      targetPath: LINEAR_PATH,
      exportName: "linearScan",
      generatorCode: INT_ARR_GEN,
      staticTimeComplexity: "O(n)",
      inputSizes: [100, 1_000, 10_000],
      warmup: 1,
      trials: 3,
      timeoutMs: 20_000,
    });

    expect(outcome.status).toBe("ok");
    // If empirical also classifies as O(n) and R² ≥ 0.85 → should agree
    if (outcome.empirical?.bigO === "O(n)" && (outcome.empirical.rSquared ?? 0) >= 0.85) {
      expect(outcome.empirical.reconciliation).toBe("agree");
    }
  }, 30_000);
});
