import { describe, expect, it } from "vitest";
import type { StaticPassResult } from "../schema/internal.js";
import { analyzeHotspots } from "./index.js";

function makeResult(overrides: Partial<StaticPassResult> = {}): StaticPassResult {
  return {
    time: "O(n)",
    space: "O(1)",
    confidence: "high",
    perNodeCosts: [],
    uncertainNodes: [],
    ...overrides,
  };
}

const forLoop: import("../schema/internal.js").PerNodeCost = {
  line: 3,
  column: 2,
  snippet: "for (const x of arr)",
  timeCost: "O(n)",
  spaceCost: "O(1)",
  reason: "Iterates over arr once",
};

const innerLoop: import("../schema/internal.js").PerNodeCost = {
  line: 5,
  column: 4,
  snippet: "for (const y of brr)",
  timeCost: "O(n)",
  spaceCost: "O(1)",
  reason: "Iterates over brr once",
};

const nestedOuter: import("../schema/internal.js").PerNodeCost = {
  line: 3,
  column: 2,
  snippet: "for (let i = 0; i < n; i++)",
  timeCost: "O(n^2)",
  spaceCost: "O(1)",
  reason: "Outer loop with O(n) inner body",
};

describe("analyzeHotspots", () => {
  it("returns empty list for O(1) unit", () => {
    const result = makeResult({
      time: "O(1)",
      perNodeCosts: [
        {
          line: 2,
          column: 0,
          snippet: "return obj[key]",
          timeCost: "O(1)",
          spaceCost: "O(1)",
          reason: "Hash lookup",
        },
      ],
    });
    expect(analyzeHotspots(result)).toEqual([]);
  });

  it("returns the dominant-term node as a hotspot", () => {
    const result = makeResult({ time: "O(n)", perNodeCosts: [forLoop] });
    const hotspots = analyzeHotspots(result);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]).toMatchObject({
      line: 3,
      column: 2,
      snippet: "for (const x of arr)",
      complexity: "O(n)",
      reason: "Iterates over arr once",
    });
    expect(hotspots[0]?.uncertain).toBeUndefined();
  });

  it("excludes nodes below the dominant term", () => {
    const result = makeResult({
      time: "O(n^2)",
      perNodeCosts: [nestedOuter, { ...forLoop, timeCost: "O(n)", reason: "Just O(n)" }],
    });
    const hotspots = analyzeHotspots(result);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]?.complexity).toBe("O(n^2)");
  });

  it("ranks multiple hotspots worst-first, stable by line/col on ties", () => {
    const node1: import("../schema/internal.js").PerNodeCost = {
      line: 5,
      column: 0,
      snippet: "arr.includes(x)",
      timeCost: "O(n^2)",
      spaceCost: "O(1)",
      reason: "O(n) builtin inside O(n) loop",
    };
    const node2: import("../schema/internal.js").PerNodeCost = {
      line: 3,
      column: 0,
      snippet: "for (let i = 0; i < n; i++)",
      timeCost: "O(n^2)",
      spaceCost: "O(1)",
      reason: "Outer loop contributing O(n^2)",
    };
    const result = makeResult({ time: "O(n^2)", perNodeCosts: [node1, node2] });
    const hotspots = analyzeHotspots(result);
    expect(hotspots).toHaveLength(2);
    // Both are O(n^2) ties — stable by line (node2 line 3 < node1 line 5)
    expect(hotspots[0]?.line).toBe(3);
    expect(hotspots[1]?.line).toBe(5);
  });

  it("flags hotspots whose node appears in uncertainNodes", () => {
    const result = makeResult({
      time: "O(n)",
      perNodeCosts: [forLoop],
      uncertainNodes: [{ line: 3, column: 2, reason: "Loop bound unclear" }],
    });
    const hotspots = analyzeHotspots(result);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]?.uncertain).toBe(true);
  });

  it("does not flag hotspots not in uncertainNodes", () => {
    const result = makeResult({
      time: "O(n)",
      perNodeCosts: [forLoop, innerLoop],
      uncertainNodes: [{ line: 5, column: 4, reason: "Unclear" }],
    });
    const hotspots = analyzeHotspots(result);
    expect(hotspots).toHaveLength(2);
    const outer = hotspots.find((h) => h.line === 3);
    const inner = hotspots.find((h) => h.line === 5);
    expect(outer?.uncertain).toBeUndefined();
    expect(inner?.uncertain).toBe(true);
  });

  it("returns empty list when no perNodeCosts match the dominant term", () => {
    const result = makeResult({ time: "O(n)", perNodeCosts: [] });
    expect(analyzeHotspots(result)).toEqual([]);
  });

  it("handles uncertain dominant term — flags all uncertain nodes as hotspots", () => {
    const uncertainNode: import("../schema/internal.js").PerNodeCost = {
      line: 4,
      column: 2,
      snippet: "while (queue.length > 0)",
      timeCost: "uncertain",
      spaceCost: "O(1)",
      reason: "Unknown loop termination",
    };
    const result = makeResult({
      time: "uncertain",
      perNodeCosts: [uncertainNode],
      uncertainNodes: [{ line: 4, column: 2, reason: "Unknown loop termination" }],
    });
    const hotspots = analyzeHotspots(result);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]?.complexity).toBe("uncertain");
    expect(hotspots[0]?.uncertain).toBe(true);
  });
});
