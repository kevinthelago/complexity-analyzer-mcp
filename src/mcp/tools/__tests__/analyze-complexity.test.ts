import { describe, expect, it } from "vitest";
import tool from "../analyze-complexity.js";

describe("analyze_complexity tool", () => {
  it("returns complexity data for a simple function", () => {
    const result = tool.execute({
      code: "function sum(a: number, b: number): number { return a + b; }",
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "{}";
    const data = JSON.parse(text) as {
      units: Array<{ name: string; timeComplexity: string; spaceComplexity: string }>;
    };
    expect(data.units).toHaveLength(1);
    expect(data.units[0]?.name).toBe("sum");
    expect(typeof data.units[0]?.timeComplexity).toBe("string");
    expect(typeof data.units[0]?.spaceComplexity).toBe("string");
  });

  it("returns multiple units for multi-function input", () => {
    const result = tool.execute({
      code: `
        function alpha(): void {}
        function beta(): void {}
      `,
      filename: "multi.ts",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { units: unknown[] };
    expect(data.units.length).toBeGreaterThanOrEqual(2);
  });

  it("includes recursion field for recursive functions", () => {
    const result = tool.execute({
      code: `
        function fib(n: number): number {
          if (n <= 1) return n;
          return fib(n - 1) + fib(n - 2);
        }
      `,
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      units: Array<{ recursion?: { kind: string } }>;
    };
    expect(data.units[0]?.recursion).toBeDefined();
    expect(data.units[0]?.recursion?.kind).toBe("exponential");
  });

  it("returns empty units for code with no functions", () => {
    const result = tool.execute({ code: "const x = 42;" });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { units: unknown[] };
    expect(data.units).toHaveLength(0);
  });

  it("returns isError for oversized input", () => {
    const bigCode = `function f() { return "${"x".repeat(257 * 1024)}"; }`;
    const result = tool.execute({ code: bigCode });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/limit/i);
  });

  it("uses provided filename without error", () => {
    const result = tool.execute({
      code: "function hello() { return 42; }",
      filename: "myfile.js",
    });
    expect(result.isError).toBeFalsy();
  });
});
