import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import tool from "../find-hotspots.js";

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
  it("returns hotspots ranked worst-first", async () => {
    const result = await tool.execute({ code: MULTI_COMPLEXITY });
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

  it("respects topN parameter", async () => {
    const result = await tool.execute({ code: MULTI_COMPLEXITY, topN: 1 });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string }>;
    };
    expect(data.hotspots).toHaveLength(1);
    expect(data.hotspots[0]?.name).toBe("quadratic");
  });

  it("returns empty hotspots for code with no functions", async () => {
    const result = await tool.execute({ code: "const x = 1;" });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { hotspots: unknown[] };
    expect(data.hotspots).toHaveLength(0);
  });

  it("includes uncertainty and recursion when present", async () => {
    const code = `
      function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `;
    const result = await tool.execute({ code });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ recursion?: { kind: string } }>;
    };
    expect(data.hotspots[0]?.recursion).toBeDefined();
  });

  it("rejects input exceeding 256 KB", async () => {
    const bigCode = `function f() { return "${"x".repeat(257 * 1024)}"; }`;
    const result = await tool.execute({ code: bigCode });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/limit/i);
  });

  it("reads from path when no inline code is given", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fh-test-"));
    const file = join(dir, "sample.ts");
    writeFileSync(file, "function linear(arr: number[]) { for (const x of arr) x; }");
    const result = await tool.execute({ path: file });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string; timeComplexity: string }>;
    };
    expect(data.hotspots.length).toBeGreaterThan(0);
    expect(data.hotspots[0]?.timeComplexity).toBe("O(n)");
  });

  it("uses basename of path as filename for language detection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fh-test-"));
    const file = join(dir, "widget.tsx");
    writeFileSync(file, "function f(arr: number[]) { for (const x of arr) x; }");
    const result = await tool.execute({ path: file });
    expect(result.isError).toBeFalsy();
    // Should not error — tsx extension correctly detected
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { hotspots: unknown[] };
    expect(Array.isArray(data.hotspots)).toBe(true);
  });

  it("prefers inline code over path when both are provided", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fh-test-"));
    const file = join(dir, "ignored.ts");
    writeFileSync(file, "function fromFile() {}"); // O(1) — would appear if path wins
    const result = await tool.execute({
      path: file,
      code: "function fromCode(arr: number[]) { for (const x of arr) x; }",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string }>;
    };
    // code wins — fromCode appears, not fromFile
    expect(data.hotspots.some((h) => h.name === "fromCode")).toBe(true);
    expect(data.hotspots.some((h) => h.name === "fromFile")).toBe(false);
  });

  it("returns isError when neither code nor path is provided", async () => {
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/code.*path|path.*code/i);
  });

  it("returns isError for a non-existent path", async () => {
    const result = await tool.execute({ path: "/nonexistent/path/to/file.ts" });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/not found/i);
  });

  it("supports glob pattern for multi-file global ranking", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fh-glob-"));
    // File A: only constant function
    writeFileSync(join(dir, "a.ts"), "function constant() { return 1; }");
    // File B: quadratic function
    writeFileSync(
      join(dir, "b.ts"),
      [
        "function quadratic(arr: number[]) {",
        "  let s = 0;",
        "  for (let i = 0; i < arr.length; i++)",
        "    for (let j = 0; j < arr.length; j++) s += arr[i]! * arr[j]!;",
        "  return s;",
        "}",
      ].join("\n"),
    );

    const globPattern = join(dir, "*.ts").replace(/\\/g, "/");
    const result = await tool.execute({ path: globPattern, topN: 2 });
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string; timeComplexity: string; filename?: string }>;
      totalFunctions: number;
    };

    expect(data.totalFunctions).toBeGreaterThanOrEqual(2);
    // quadratic should rank first across both files
    expect(data.hotspots[0]?.name).toBe("quadratic");
    // multi-file results include filename
    expect(data.hotspots[0]?.filename).toBeDefined();
  });

  it("returns empty hotspots for a glob matching no files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fh-empty-"));
    const globPattern = join(dir, "*.ts").replace(/\\/g, "/");
    const result = await tool.execute({ path: globPattern });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { hotspots: unknown[] };
    expect(data.hotspots).toHaveLength(0);
  });
});
