import { describe, expect, it } from "vitest";
import { KB_VERSION } from "../../engine/cost-rules/index.js";
import { runPipeline } from "../../engine/pipeline/index.js";
import { AnalysisResultSchema } from "../../engine/schema/index.js";

const SIMPLE_FN = "function add(a: number, b: number): number { return a + b; }";
const LOOP_FN = `
  function sumArr(arr: number[]): number {
    let s = 0;
    for (const x of arr) s += x;
    return s;
  }
`;

describe("runPipeline — schema validation", () => {
  it("output validates against AnalysisResultSchema for a simple function", () => {
    const result = runPipeline(SIMPLE_FN);
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });

  it("output validates for sources with no analyzable units", () => {
    const result = runPipeline("const x = 1;");
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });

  it("output validates for any input — never throws", () => {
    expect(() => runPipeline("function (((")).not.toThrow();
    expect(() => runPipeline("$$$ not valid")).not.toThrow();
  });
});

describe("runPipeline — no-unit / empty result envelope", () => {
  it("returns empty units array when source has no functions", () => {
    const result = runPipeline("const x = 42; const y = 'hello';");
    expect(result.units).toHaveLength(0);
  });

  it("never throws on any input", () => {
    expect(() => runPipeline("")).not.toThrow();
    expect(() => runPipeline("function (((")).not.toThrow();
  });
});

describe("runPipeline — metadata", () => {
  it("carries the current KB version", () => {
    const result = runPipeline(SIMPLE_FN);
    expect(result.kbVersion).toBe(KB_VERSION);
  });

  it("detects typescript lang from .ts filename", () => {
    const result = runPipeline(SIMPLE_FN, { filename: "foo.ts" });
    expect(result.lang).toBe("typescript");
  });

  it("detects javascript lang from .js filename", () => {
    const result = runPipeline("function f() { return 1; }", { filename: "foo.js" });
    expect(result.lang).toBe("javascript");
  });
});

describe("runPipeline — pipeline stages", () => {
  it("runs hotspots stage by default", () => {
    const result = runPipeline(LOOP_FN);
    expect(result.analyzedBy).toContain("hotspots");
    const unit = result.units[0];
    expect(unit?.hotspots).toBeDefined();
    expect(Array.isArray(unit?.hotspots)).toBe(true);
  });

  it("skips hotspots when stage not in options", () => {
    const result = runPipeline(LOOP_FN, { stages: [] });
    const unit = result.units[0];
    expect(unit?.hotspots).toHaveLength(0);
    expect(result.analyzedBy).not.toContain("hotspots");
  });

  it("analyzedBy includes 'parse' and 'static'", () => {
    const result = runPipeline(SIMPLE_FN);
    expect(result.analyzedBy).toContain("parse");
    expect(result.analyzedBy).toContain("static");
  });
});

describe("runPipeline — per-unit results", () => {
  it("assembles per-unit complexity fields", () => {
    const result = runPipeline(SIMPLE_FN);
    const unit = result.units[0];
    expect(unit?.timeComplexity).toBe("O(1)");
    expect(unit?.spaceComplexity).toBe("O(1)");
    expect(unit?.confidence).toBe("high");
    expect(unit?.name).toBe("add");
  });

  it("each unit has expected fields", () => {
    const result = runPipeline(LOOP_FN);
    expect(result.units.length).toBeGreaterThan(0);
    const unit = result.units[0];
    if (!unit) throw new Error("no unit returned");
    expect(typeof unit.name).toBe("string");
    expect(["function", "method", "arrow", "constructor"]).toContain(unit.kind);
    expect(typeof unit.startLine).toBe("number");
    expect(typeof unit.endLine).toBe("number");
    expect(typeof unit.timeComplexity).toBe("string");
    expect(typeof unit.spaceComplexity).toBe("string");
  });

  it("is a pure function — identical input yields identical output", () => {
    const r1 = runPipeline(LOOP_FN);
    const r2 = runPipeline(LOOP_FN);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("runPipeline — statelessness", () => {
  it("two successive calls are independent", () => {
    const a = runPipeline(SIMPLE_FN);
    const b = runPipeline(LOOP_FN);
    expect(a.units[0]?.timeComplexity).toBe("O(1)");
    expect(b.units[0]?.timeComplexity).toBe("O(n)");
  });
});
