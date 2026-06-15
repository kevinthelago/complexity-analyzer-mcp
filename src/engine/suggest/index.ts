import type { AnalyzableUnit } from "../parser/types.js";
import type { StaticComplexityResult } from "../static/types.js";
import {
  detectMembershipInLoop,
  detectNestedScan,
  detectRecomputeInRecursion,
  detectSortInLoop,
  detectUnshiftSpliceInLoop,
} from "./rules.js";
import type { OptimizationSuggestion, SuggestionResult } from "./types.js";

export type { OptimizationSuggestion, PatternKind, SuggestionResult } from "./types.js";

const PRIORITY: Record<string, number> = {
  "recompute-in-recursion": 5,
  "membership-in-loop": 4,
  "nested-scan": 4,
  "sort-in-loop": 3,
  "unshift-splice-in-loop": 3,
};

function priorityOf(s: OptimizationSuggestion): number {
  return PRIORITY[s.pattern] ?? 0;
}

/**
 * Generate optimization suggestions for a single analyzable unit.
 *
 * Runs all static pattern detectors and returns deduplicated results ordered
 * by projected impact (largest complexity reduction first).
 *
 * @param unit - The parseable unit produced by the parser layer.
 * @param staticResult - Pre-computed static complexity result for the unit.
 */
export function suggestOptimizations(
  unit: AnalyzableUnit,
  staticResult: StaticComplexityResult,
): SuggestionResult {
  const membership = detectMembershipInLoop(unit);

  // Pass membership loop keys so nested-scan can skip already-covered loops
  const membershipLoopKeys = new Set(
    membership.map((s) => `${s.location.startLine}:${s.location.endLine}`),
  );
  const all: OptimizationSuggestion[] = [
    ...membership,
    ...detectSortInLoop(unit),
    ...detectUnshiftSpliceInLoop(unit),
    ...detectRecomputeInRecursion(unit, staticResult),
    ...detectNestedScan(unit, membershipLoopKeys),
  ];

  all.sort((a, b) => priorityOf(b) - priorityOf(a));

  return {
    suggestions: all,
    summary:
      all.length > 0
        ? `Found ${all.length} optimization ${all.length === 1 ? "opportunity" : "opportunities"}.`
        : "no improvement found",
  };
}
