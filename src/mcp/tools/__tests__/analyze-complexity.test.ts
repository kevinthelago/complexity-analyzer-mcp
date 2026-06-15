import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "../../../engine/schema/index.js";
import tool from "../analyze-complexity.js";

describe("analyze_complexity tool", () => {
  it("returns a full AnalysisResult for a simple function", () => {
    const result = tool.execute({
      code: "function sum(a: number, b: number): number { return a + b; }",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
    expect(data.units).toHaveLength(1);
    expect(data.units[0]?.name).toBe("sum");
    expect(typeof data.units[0]?.timeComplexity).toBe("string");
    expect(typeof data.units[0]?.spaceComplexity).toBe("string");
    expect(data.lang).toBe("typescript");
    expect(typeof data.kbVersion).toBe("string");
    expect(Array.isArray(data.analyzedBy)).toBe(true);
    expect(Array.isArray(data.notes)).toBe(true);
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
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
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
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
    expect(data.units[0]?.recursion).toBeDefined();
    expect(data.units[0]?.recursion?.kind).toBe("exponential");
  });

  it("returns empty units for code with no functions", () => {
    const result = tool.execute({ code: "const x = 42;" });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
    expect(data.units).toHaveLength(0);
    expect(data.notes).toContain("no_analyzable_units");
  });

  it("returns isError for oversized input", () => {
    const bigCode = `function f() { return "${"x".repeat(257 * 1024)}"; }`;
    const result = tool.execute({ code: bigCode });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/limit/i);
  });

  it("uses provided filename for language detection", () => {
    const result = tool.execute({
      code: "function hello() { return 42; }",
      filename: "myfile.js",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
    expect(data.lang).toBe("javascript");
  });

  it("reads from path when code is omitted", () => {
    const tmp = join(tmpdir(), "ac-test.ts");
    writeFileSync(tmp, "function greet(name: string) { return name; }");
    const result = tool.execute({ path: tmp });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
    expect(data.units[0]?.name).toBe("greet");
  });

  it("code takes precedence over path when both provided", () => {
    const result = tool.execute({
      code: "function inline() {}",
      path: "/nonexistent/file.ts",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
    expect(data.units[0]?.name).toBe("inline");
  });

  it("returns isError when path does not exist", () => {
    const result = tool.execute({ path: "/no/such/file.ts" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/could not read/i);
  });

  it("returns isError when neither code nor path is provided", () => {
    const result = tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/code or path/i);
  });

  it("includes hotspots in unit results for looping code", () => {
    const result = tool.execute({
      code: `
        function scan(arr: number[]): number {
          let s = 0;
          for (const x of arr) s += x;
          return s;
        }
      `,
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as AnalysisResult;
    expect(data.units[0]?.hotspots).toBeDefined();
    expect(data.units[0]?.hotspots.length).toBeGreaterThan(0);
  });
});
