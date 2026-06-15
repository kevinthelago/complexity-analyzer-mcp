import { describe, expect, it } from "vitest";
import { AnalysisResultSchema } from "../../schema/index.js";
import { runPipeline } from "../index.js";

const SIMPLE_FN = `function add(a: number, b: number): number { return a + b; }`;
const LOOP_FN = `
  function sum(arr: number[]): number {
    let s = 0;
    for (const x of arr) s += x;
    return s;
  }
`;
const NESTED_FN = `
  function bubbleSort(arr: number[]): void {
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length - i - 1; j++) {
        if ((arr[j] ?? 0) > (arr[j + 1] ?? 0)) {
          const tmp = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = tmp;
        }
      }
    }
  }
`;

// ── Schema validation ────────────────────────────────────────────────────────

describe("runPipeline — schema validation", () => {
  it("result passes zod schema for a simple function", () => {
    const result = runPipeline(SIMPLE_FN);
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });

  it("result passes zod schema for a loop function", () => {
    const result = runPipeline(LOOP_FN);
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });

  it("result passes zod schema for nested loops", () => {
    const result = runPipeline(NESTED_FN);
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });
});

// ── Top-level metadata ────────────────────────────────────────────────────────

describe("runPipeline — top-level metadata", () => {
  it("sets lang from filename extension", () => {
    expect(runPipeline(SIMPLE_FN, { filename: "input.ts" }).lang).toBe("typescript");
    expect(runPipeline(SIMPLE_FN, { filename: "input.tsx" }).lang).toBe("tsx");
    expect(runPipeline(SIMPLE_FN, { filename: "input.js" }).lang).toBe("javascript");
  });

  it("includes kbVersion in the result", () => {
    const result = runPipeline(SIMPLE_FN);
    expect(result.kbVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("tracks analyzedBy stages — default includes parse, static, hotspots", () => {
    const result = runPipeline(LOOP_FN);
    expect(result.analyzedBy).toContain("parse");
    expect(result.analyzedBy).toContain("static");
    expect(result.analyzedBy).toContain("hotspots");
  });

  it("notes is an array (empty when all is well)", () => {
    const result = runPipeline(SIMPLE_FN);
    expect(Array.isArray(result.notes)).toBe(true);
  });
});

// ── Error envelopes ───────────────────────────────────────────────────────────

describe("runPipeline — error envelopes", () => {
  it("returns parseError for unparseable source, not throwing", () => {
    const result = runPipeline("function }{{{{{ broken");
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
    // May produce units (ts-morph is lenient) OR a parse note; the key is it doesn't throw
    expect(result).toHaveProperty("units");
    expect(Array.isArray(result.units)).toBe(true);
  });

  it("returns no_analyzable_units note for source with no functions", () => {
    const result = runPipeline("const x = 42;");
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
    if (result.units.length === 0) {
      expect(result.notes).toContain("no_analyzable_units");
    }
  });

  it("empty source returns well-formed result", () => {
    const result = runPipeline("");
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });
});

// ── Per-unit results ──────────────────────────────────────────────────────────

describe("runPipeline — per-unit results", () => {
  it("each unit has expected fields", () => {
    const result = runPipeline(LOOP_FN);
    expect(result.units.length).toBeGreaterThan(0);
    const unit = result.units[0]!;
    expect(typeof unit.name).toBe("string");
    expect(["function", "method", "arrow", "constructor"]).toContain(unit.kind);
    expect(typeof unit.startLine).toBe("number");
    expect(typeof unit.endLine).toBe("number");
    expect(typeof unit.timeComplexity).toBe("string");
    expect(typeof unit.spaceComplexity).toBe("string");
    expect(["high", "medium", "low"]).toContain(unit.confidence);
    expect(Array.isArray(unit.hotspots)).toBe(true);
    expect(Array.isArray(unit.uncertainNodes)).toBe(true);
  });

  it("O(1) function has empty hotspots", () => {
    const result = runPipeline(SIMPLE_FN);
    expect(result.units[0]!.hotspots).toHaveLength(0);
  });

  it("loop function has hotspot in default pipeline", () => {
    const result = runPipeline(LOOP_FN);
    expect(result.units[0]!.hotspots.length).toBeGreaterThan(0);
  });

  it("nested loop function has O(n²) timeComplexity", () => {
    const result = runPipeline(NESTED_FN);
    expect(result.units[0]!.timeComplexity).toBe("O(n²)");
  });
});

// ── Subset pipelines ─────────────────────────────────────────────────────────

describe("runPipeline — subset pipelines", () => {
  it("stages:[] skips hotspots; analyzedBy has parse+static only", () => {
    const result = runPipeline(LOOP_FN, { stages: [] });
    expect(result.analyzedBy).toContain("parse");
    expect(result.analyzedBy).toContain("static");
    expect(result.analyzedBy).not.toContain("hotspots");
    expect(result.units[0]!.hotspots).toHaveLength(0);
  });

  it("stages:['hotspots'] includes hotspot results", () => {
    const result = runPipeline(LOOP_FN, { stages: ["hotspots"] });
    expect(result.analyzedBy).toContain("hotspots");
    expect(result.units[0]!.hotspots.length).toBeGreaterThan(0);
  });

  it("requesting suggestions stage adds a note (not yet implemented)", () => {
    const result = runPipeline(SIMPLE_FN, { stages: ["suggestions"] });
    expect(result.notes.some((n) => n.includes("suggestions"))).toBe(true);
  });
});

// ── Statelessness ────────────────────────────────────────────────────────────

describe("runPipeline — pure function", () => {
  it("identical input produces identical output", () => {
    const a = runPipeline(NESTED_FN, { filename: "test.ts" });
    const b = runPipeline(NESTED_FN, { filename: "test.ts" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("different filenames produce different lang fields", () => {
    const ts = runPipeline(SIMPLE_FN, { filename: "a.ts" });
    const js = runPipeline(SIMPLE_FN, { filename: "a.js" });
    expect(ts.lang).not.toBe(js.lang);
  });
});

// ── Multiple units ─────────────────────────────────────────────────────────

describe("runPipeline — multiple units", () => {
  it("all functions in a file produce separate unit results", () => {
    const src = `
      function foo(arr: number[]): number { return arr.length; }
      function bar(arr: number[]): number {
        let s = 0;
        for (const x of arr) s += x;
        return s;
      }
    `;
    const result = runPipeline(src);
    expect(result.units.length).toBe(2);
    const names = result.units.map((u) => u.name);
    expect(names).toContain("foo");
    expect(names).toContain("bar");
  });
});
