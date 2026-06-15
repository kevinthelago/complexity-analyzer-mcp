import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import tool from "../find-hotspots.js";

const TMP = join(tmpdir(), "ca-hotspots-test");
mkdirSync(TMP, { recursive: true });
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const MULTI_COMPLEXITY = `
  function constant() { return 1; }
  function linear(arr: number[]) { return arr.reduce((s, x) => s + x, 0); }
  function quadratic(arr: number[]) {
    let s = 0;
    for (let i = 0; i < arr.length; i++)
      for (let j = 0; j < arr.length; j++) s += arr[i]! * arr[j]!;
    return s;
  }
`;

describe("find_hotspots tool", () => {
  it("returns hotspots ranked worst-first", () => {
    const result = tool.execute({ code: MULTI_COMPLEXITY });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string; timeComplexity: string }>;
      totalFunctions: number;
    };
    // totalFunctions includes any inner arrow functions the parser extracts
    expect(data.totalFunctions).toBeGreaterThanOrEqual(3);
    expect(data.hotspots.length).toBeLessThanOrEqual(5);
    expect(data.hotspots[0]?.name).toBe("quadratic");
  });

  it("respects topN parameter", () => {
    const result = tool.execute({ code: MULTI_COMPLEXITY, topN: 1 });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string }>;
    };
    expect(data.hotspots).toHaveLength(1);
    expect(data.hotspots[0]?.name).toBe("quadratic");
  });

  it("returns empty hotspots for code with no functions", () => {
    const result = tool.execute({ code: "const x = 1;" });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { hotspots: unknown[] };
    expect(data.hotspots).toHaveLength(0);
  });

  it("includes uncertainty and recursion when present", () => {
    const code = `
      function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `;
    const result = tool.execute({ code });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ recursion?: { kind: string } }>;
    };
    expect(data.hotspots[0]?.recursion).toBeDefined();
  });

  it("rejects input exceeding 256 KB", () => {
    const bigCode = `function f() { return "${"x".repeat(257 * 1024)}"; }`;
    const result = tool.execute({ code: bigCode });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/limit/i);
  });

  // path parameter tests
  it("reads source from path when code is not provided", () => {
    const file = join(TMP, "multi.ts");
    writeFileSync(file, MULTI_COMPLEXITY);
    const result = tool.execute({ path: file });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string }>;
    };
    expect(data.hotspots[0]?.name).toBe("quadratic");
  });

  it("code takes precedence over path when both are provided", () => {
    const file = join(TMP, "quadratic.ts");
    writeFileSync(file, "function fromFile() { for(let i=0;i<n;i++) for(let j=0;j<n;j++){} }");
    // code has only a constant function; if path wins the hotspot would be 'fromFile'
    const result = tool.execute({
      code: "function fromCode() { return 1; }",
      path: file,
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string }>;
    };
    // constant has no hotspot (empty) or fromCode — either way, fromFile should not appear
    const names = data.hotspots.map((h) => h.name);
    expect(names).not.toContain("fromFile");
  });

  it("returns isError for a non-existent path", () => {
    const result = tool.execute({ path: "/no/such/file.ts" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/could not read/i);
  });

  it("returns isError when neither code nor path is provided", () => {
    const result = tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/code or path/i);
  });
});
