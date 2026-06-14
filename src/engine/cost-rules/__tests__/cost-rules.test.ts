import { describe, expect, it } from "vitest";
import { COST_RULES, KB_VERSION, lookupCost } from "../index.js";

describe("KB_VERSION", () => {
  it("is a non-empty semver string", () => {
    expect(typeof KB_VERSION).toBe("string");
    expect(KB_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("lookupCost — type-aware", () => {
  it("returns O(n log n) for Array.sort", () => {
    const result = lookupCost("sort", "Array<number>");
    expect(result.time).toBe("O(n log n)");
  });

  it("returns O(1) for Set.add", () => {
    const result = lookupCost("add", "Set<string>");
    expect(result.time).toBe("O(1)");
  });

  it("returns O(1) for Map.get", () => {
    const result = lookupCost("get", "Map<string, number>");
    expect(result.time).toBe("O(1)");
  });

  it("returns O(n) for Array.map", () => {
    const result = lookupCost("map", "Array<number>");
    expect(result.time).toBe("O(n)");
    expect(result.space).toBe("O(n)");
  });

  it("returns O(n) for Array.filter", () => {
    const result = lookupCost("filter", "Array<number>");
    expect(result.time).toBe("O(n)");
  });

  it("returns O(n) for Array.forEach", () => {
    const result = lookupCost("forEach", "Array<number>");
    expect(result.time).toBe("O(n)");
  });

  it("returns O(1) for Array.push", () => {
    const result = lookupCost("push", "Array<number>");
    expect(result.time).toBe("O(1)");
  });

  it("returns O(n) for Array.unshift", () => {
    const result = lookupCost("unshift", "Array<number>");
    expect(result.time).toBe("O(n)");
  });

  it("returns O(n) for JSON.parse", () => {
    const result = lookupCost("parse", "JSON");
    expect(result.time).toBe("O(n)");
  });

  it("returns O(1) for Math.sqrt", () => {
    const result = lookupCost("sqrt", "Math");
    expect(result.time).toBe("O(1)");
  });

  it("returns scalesIn containing n for Array.sort", () => {
    const result = lookupCost("sort", "Array<string>");
    expect(result.scalesIn).toContain("n");
  });
});

describe("lookupCost — unknown result", () => {
  it("returns explicit unknown for completely unknown operation", () => {
    const result = lookupCost("madeUpMethod");
    expect(result.time).toBe("unknown");
    expect(result.space).toBe("unknown");
    expect(result.rationale).toBeTruthy();
  });

  it("never returns O(1) silently for unknown — always explicit unknown", () => {
    const result = lookupCost("xyzzy_nonexistent_8472");
    expect(result.time).not.toBe("O(1)");
  });
});

describe("lookupCost — syntactic fallback (no type info)", () => {
  it("returns a result for sort without type info", () => {
    const result = lookupCost("sort");
    expect(result.time).toBeDefined();
  });

  it("returns unknown for truly unrecognized method", () => {
    const result = lookupCost("unknownXYZ");
    expect(result.time).toBe("unknown");
  });
});

describe("COST_RULES catalog", () => {
  it("has at least one rule per major type (Array, Set, Map, String, Object, JSON, Math, Promise)", () => {
    const types = new Set(COST_RULES.map((r) => r.receiverType).filter(Boolean));
    for (const t of ["Array", "Set", "Map", "String", "Object", "JSON", "Math", "Promise"]) {
      expect(types).toContain(t);
    }
  });

  it("every rule has a non-empty rationale", () => {
    for (const rule of COST_RULES) {
      expect(rule.complexity.rationale).toBeTruthy();
      expect(rule.complexity.rationale.length).toBeGreaterThan(0);
    }
  });

  it("every rule has a valid time complexity string", () => {
    for (const rule of COST_RULES) {
      expect(rule.complexity.time).toMatch(/^O\(.+\)$/);
    }
  });
});
