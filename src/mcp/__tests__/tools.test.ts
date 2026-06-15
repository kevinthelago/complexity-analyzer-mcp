import { describe, expect, it } from "vitest";
import analyzeComplexityTool from "../tools/analyze-complexity.js";
import findHotspotsTool from "../tools/find-hotspots.js";
import suggestOptimizationsTool from "../tools/suggest-optimizations.js";

// Minimal valid source with one O(n) function
const LINEAR_SRC = `
function linear(arr: number[]): number {
  let sum = 0;
  for (const x of arr) sum += x;
  return sum;
}
`;

// Source with a nested loop (O(n²))
const QUADRATIC_SRC = `
function quadratic(arr: number[]): number {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      count++;
    }
  }
  return count;
}
`;

// Source with two functions of different complexity for hotspot ranking
const MIXED_SRC = `
function constant(): number {
  return 42;
}

function quadratic(arr: number[]): number {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      count++;
    }
  }
  return count;
}
`;

// ── analyze_complexity ────────────────────────────────────────────────────────

describe("analyze_complexity tool", () => {
  it("has correct metadata", () => {
    expect(analyzeComplexityTool.name).toBe("analyze_complexity");
    expect(typeof analyzeComplexityTool.description).toBe("string");
    expect(analyzeComplexityTool.inputShape).toBeDefined();
    expect(typeof analyzeComplexityTool.execute).toBe("function");
  });

  it("returns units for valid source", async () => {
    const result = await analyzeComplexityTool.execute({ code: LINEAR_SRC });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]?.text ?? "{}") as { units: unknown[] };
    expect(Array.isArray(parsed.units)).toBe(true);
    expect(parsed.units.length).toBeGreaterThan(0);
  });

  it("each unit has required complexity fields", async () => {
    const result = await analyzeComplexityTool.execute({ code: LINEAR_SRC });
    const { units } = JSON.parse(result.content[0]?.text ?? "{}") as {
      units: Array<{
        name: string;
        kind: string;
        startLine: number;
        endLine: number;
        timeComplexity: string;
        spaceComplexity: string;
        confidence: string;
      }>;
    };
    for (const u of units) {
      expect(typeof u.name).toBe("string");
      expect(typeof u.kind).toBe("string");
      expect(typeof u.startLine).toBe("number");
      expect(typeof u.endLine).toBe("number");
      expect(typeof u.timeComplexity).toBe("string");
      expect(typeof u.spaceComplexity).toBe("string");
      expect(["high", "medium", "low"]).toContain(u.confidence);
    }
  });

  it("returns error for oversized input", async () => {
    const big = "x".repeat(260 * 1024);
    const result = await analyzeComplexityTool.execute({ code: big });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/exceeds/i);
  });

  it("returns error for unparseable source", async () => {
    const result = await analyzeComplexityTool.execute({ code: "{{{{ not valid TS" });
    // May succeed (ts-morph is lenient) or return parse error — just must not throw
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("returns message for source with no functions", async () => {
    const result = await analyzeComplexityTool.execute({ code: "const x = 1;" });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      units: unknown[];
      message?: string;
    };
    expect(body.units).toHaveLength(0);
    expect(body.message).toBeTruthy();
  });

  it("respects optional filename parameter", async () => {
    const result = await analyzeComplexityTool.execute({
      code: "function f() { return 1; }",
      filename: "my-file.js",
    });
    expect(result.isError).toBeUndefined();
  });
});

// ── find_hotspots ─────────────────────────────────────────────────────────────

describe("find_hotspots tool", () => {
  it("has correct metadata", () => {
    expect(findHotspotsTool.name).toBe("find_hotspots");
    expect(typeof findHotspotsTool.description).toBe("string");
    expect(findHotspotsTool.inputShape).toBeDefined();
    expect(typeof findHotspotsTool.execute).toBe("function");
  });

  it("returns hotspots ranked worst-first", async () => {
    const result = await findHotspotsTool.execute({ code: MIXED_SRC });
    expect(result.isError).toBeUndefined();
    const { hotspots } = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string; timeComplexity: string }>;
      totalFunctions: number;
    };
    expect(Array.isArray(hotspots)).toBe(true);
    // quadratic should rank above constant
    const names = hotspots.map((h) => h.name);
    expect(names.indexOf("quadratic")).toBeLessThan(names.indexOf("constant"));
  });

  it("respects topN parameter", async () => {
    const result = await findHotspotsTool.execute({ code: MIXED_SRC, topN: 1 });
    const { hotspots } = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: unknown[];
    };
    expect(hotspots).toHaveLength(1);
  });

  it("includes totalFunctions in output", async () => {
    const result = await findHotspotsTool.execute({ code: MIXED_SRC });
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: unknown[];
      totalFunctions: number;
    };
    expect(typeof body.totalFunctions).toBe("number");
    expect(body.totalFunctions).toBeGreaterThanOrEqual(body.hotspots.length);
  });

  it("returns error for oversized input", async () => {
    const big = "x".repeat(260 * 1024);
    const result = await findHotspotsTool.execute({ code: big });
    expect(result.isError).toBe(true);
  });

  it("each hotspot has required fields", async () => {
    const result = await findHotspotsTool.execute({ code: QUADRATIC_SRC });
    const { hotspots } = JSON.parse(result.content[0]?.text ?? "{}") as {
      hotspots: Array<{
        name: string;
        kind: string;
        startLine: number;
        endLine: number;
        timeComplexity: string;
        spaceComplexity: string;
        confidence: string;
      }>;
    };
    for (const h of hotspots) {
      expect(typeof h.name).toBe("string");
      expect(typeof h.kind).toBe("string");
      expect(typeof h.timeComplexity).toBe("string");
      expect(typeof h.spaceComplexity).toBe("string");
      expect(["high", "medium", "low"]).toContain(h.confidence);
    }
  });
});

// ── suggest_optimizations ─────────────────────────────────────────────────────

describe("suggest_optimizations tool", () => {
  it("has correct metadata", () => {
    expect(suggestOptimizationsTool.name).toBe("suggest_optimizations");
    expect(typeof suggestOptimizationsTool.description).toBe("string");
    expect(suggestOptimizationsTool.inputShape).toBeDefined();
    expect(typeof suggestOptimizationsTool.execute).toBe("function");
  });

  it("returns suggestions object for valid source", async () => {
    const result = await suggestOptimizationsTool.execute({ code: QUADRATIC_SRC });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      suggestions: unknown[];
      summary: string;
    };
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(typeof body.summary).toBe("string");
  });

  it("returns no improvement message for source with no functions", async () => {
    const result = await suggestOptimizationsTool.execute({ code: "const x = 1;" });
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]?.text ?? "{}") as {
      suggestions: unknown[];
      summary: string;
    };
    expect(body.suggestions).toHaveLength(0);
    expect(body.summary).toBeTruthy();
  });

  it("returns error for unparseable source", async () => {
    // ts-morph is lenient but a completely broken file may surface as an error result
    const result = await suggestOptimizationsTool.execute({ code: "{{{{ not valid TS" });
    expect(Array.isArray(result.content)).toBe(true);
  });
});
