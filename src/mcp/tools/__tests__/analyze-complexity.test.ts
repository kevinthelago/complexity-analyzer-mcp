import { describe, expect, it } from "vitest";
import { analyzeComplexityTool } from "../analyze-complexity.js";

describe("analyze_complexity tool", () => {
  it("returns complexity data for a simple function", () => {
    const result = analyzeComplexityTool.execute({
      code: "function sum(a: number, b: number): number { return a + b; }",
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0]?.text ?? "{}";
    const data = JSON.parse(text) as {
      file: string;
      units: Array<{ name: string; timeComplexity: string; spaceComplexity: string }>;
    };
    expect(data.units).toHaveLength(1);
    expect(data.units[0]?.name).toBe("sum");
    expect(typeof data.units[0]?.timeComplexity).toBe("string");
    expect(typeof data.units[0]?.spaceComplexity).toBe("string");
  });

  it("uses provided filename in the response", () => {
    const result = analyzeComplexityTool.execute({
      code: "function hello() { return 42; }",
      filename: "myfile.js",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { file: string };
    expect(data.file).toBe("myfile.js");
  });

  it("returns isError when code is missing", () => {
    const result = analyzeComplexityTool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("'code' must be a string");
  });

  it("returns isError when code is not a string", () => {
    const result = analyzeComplexityTool.execute({ code: 42 });
    expect(result.isError).toBe(true);
  });

  it("returns multiple units for multi-function input", () => {
    const result = analyzeComplexityTool.execute({
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
    const result = analyzeComplexityTool.execute({
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

  it("defaults filename to input.ts when omitted", () => {
    const result = analyzeComplexityTool.execute({
      code: "function noop() {}",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { file: string };
    expect(data.file).toBe("input.ts");
  });
});
