import type { PerNodeCost, StaticPassResult } from "../schema/internal.js";
import type { Hotspot, UncertainNode } from "../schema/types.js";
import { BIG_O_WEIGHT } from "../schema/types.js";

function isUncertain(node: PerNodeCost, uncertainNodes: UncertainNode[]): boolean {
  return uncertainNodes.some((u) => u.line === node.line && u.column === node.column);
}

/**
 * Selects hotspots from a unit's static-pass result.
 *
 * Hotspots are constructs whose effective time cost equals the unit's dominant term.
 * Returns empty for O(1) units. Results are ranked worst-first (stable on ties by
 * line/column). Nodes present in the pass's uncertainNodes list are flagged uncertain.
 */
export function analyzeHotspots(result: StaticPassResult): Hotspot[] {
  const { time, perNodeCosts, uncertainNodes } = result;

  if (time === "O(1)") return [];

  const dominantWeight = BIG_O_WEIGHT[time];

  const matched = perNodeCosts.filter((node) => {
    if (time === "uncertain") {
      return node.timeCost === "uncertain";
    }
    return BIG_O_WEIGHT[node.timeCost] === dominantWeight;
  });

  const sorted = [...matched].sort((a, b) => {
    const weightDiff = BIG_O_WEIGHT[b.timeCost] - BIG_O_WEIGHT[a.timeCost];
    if (weightDiff !== 0) return weightDiff;
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  return sorted.map((node) => {
    const uncertain = isUncertain(node, uncertainNodes);
    const hotspot: Hotspot = {
      line: node.line,
      column: node.column,
      snippet: node.snippet,
      complexity: node.timeCost,
      reason: node.reason,
      ...(uncertain ? { uncertain: true } : {}),
    };
    return hotspot;
  });
}
