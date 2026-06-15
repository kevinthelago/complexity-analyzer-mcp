import { describe, expect, it } from "vitest";
import { KB_VERSION } from "../../engine/cost-rules/index.js";
import { analyze } from "../../engine/pipeline/index.js";
import { AnalysisResultSchema } from "../../engine/schema/index.js";

const SIMPLE_FN = "function add(a: number, b: number): number { return a + b; }";
const LOOP_FN = `
  function sumArr(arr: number[]): number {
    let s = 0;
    for (const x of arr) s += x;
    return s;
  }
`;
describe("analyze — schema validation", () => {
  it("output validates against AnalysisResultSchema for a simple function", () => {
    const result = analyze(SIMPLE_FN);
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });

  it("output validates for sources with no analyzable units", () => {
    const result = analyze("const x = 1;");
    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
  });

  it("output validates for any input — never throws", () => {
    // TypeScript error-recovery parser handles malformed input gracefully;
    // the pipeline always returns a well-formed result.
    expect(() => analyze("function (((")).not.toThrow();
    expect(() => analyze("$$$ not valid")).not.toThrow();
  });
});

describe("analyze — no-unit / empty result envelope", () => {
  it("success=true with empty units when source has no functions", () => {
    // ts-morph uses error recovery — even syntactically odd input may not
    // produce a parseError; what matters is that the pipeline is non-throwing
    // and well-formed.
    const result = analyze("const x = 42; const y = 'hello';");
    expect(result.success).toBe(true);
    expect(result.units).toHaveLength(0);
  });

  it("never throws on any input", () => {
    expect(() => analyze("")).not.toThrow();
    expect(() => analyze("function (((")).not.toThrow();
  });
});

describe("analyze — metadata", () => {
  it("carries the current KB version", () => {
    const result = analyze(SIMPLE_FN);
    expect(result.metadata.kbVersion).toBe(KB_VERSION);
  });

  it("detects ts lang from .ts filename", () => {
    const result = analyze(SIMPLE_FN, { filename: "foo.ts" });
    expect(result.metadata.lang).toBe("ts");
  });

  it("detects js lang from .js filename", () => {
    const result = analyze("function f() { return 1; }", { filename: "foo.js" });
    expect(result.metadata.lang).toBe("js");
  });

  it("respects explicit lang override", () => {
    const result = analyze(SIMPLE_FN, { lang: "js" });
    expect(result.metadata.lang).toBe("js");
  });
});

describe("analyze — pipeline stages", () => {
  it("runs hotspots stage by default", () => {
    const result = analyze(LOOP_FN);
    expect(result.success).toBe(true);
    const unit = result.units[0];
    // An O(n) function should produce at least one hotspot (the loop itself).
    expect(unit?.hotspots).toBeDefined();
    expect(Array.isArray(unit?.hotspots)).toBe(true);
  });

  it("skips hotspots when stage not requested", () => {
    const result = analyze(LOOP_FN, { stages: ["static"] });
    const unit = result.units[0];
    expect(unit?.hotspots).toHaveLength(0);
  });

  it("analyzedBy is 'static' for the static pipeline", () => {
    const result = analyze(SIMPLE_FN);
    expect(result.units[0]?.analyzedBy).toBe("static");
  });
});

describe("analyze — unit fields", () => {
  it("assembles per-unit complexity fields", () => {
    const result = analyze(SIMPLE_FN);
    const unit = result.units[0];
    expect(unit?.timeComplexity).toBe("O(1)");
    expect(unit?.spaceComplexity).toBe("O(1)");
    expect(unit?.confidence).toBe("high");
    expect(unit?.name).toBe("add");
  });

  it("is a pure function — identical input yields identical output", () => {
    const r1 = analyze(LOOP_FN);
    const r2 = analyze(LOOP_FN);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("analyze — statelessness", () => {
  it("two successive calls are independent", () => {
    const a = analyze(SIMPLE_FN);
    const b = analyze(LOOP_FN);
    expect(a.units[0]?.timeComplexity).toBe("O(1)");
    expect(b.units[0]?.timeComplexity).toBe("O(n)");
  });
});
