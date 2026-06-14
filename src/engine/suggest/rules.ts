import {
  Node,
  type CallExpression,
  type DoStatement,
  type ForInStatement,
  type ForOfStatement,
  type ForStatement,
  type WhileStatement,
} from "ts-morph";
import type { AnalyzableUnit } from "../parser/types.js";
import type { StaticComplexityResult } from "../static/types.js";
import type { OptimizationSuggestion } from "./types.js";

// ── Loop helpers ─────────────────────────────────────────────────────────────

type LoopNode = ForStatement | ForOfStatement | ForInStatement | WhileStatement | DoStatement;

function isLoopNode(node: Node): node is LoopNode {
  return (
    Node.isForStatement(node) ||
    Node.isForOfStatement(node) ||
    Node.isForInStatement(node) ||
    Node.isWhileStatement(node) ||
    Node.isDoStatement(node)
  );
}

function isFunctionBoundary(node: Node): boolean {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isConstructorDeclaration(node)
  );
}

/**
 * Walk up the parent chain without crossing function/arrow boundaries.
 * Returns the innermost enclosing loop, or undefined if none.
 */
function getContainingLoopInScope(node: Node): LoopNode | undefined {
  let cur = node.getParent();
  while (cur) {
    if (isLoopNode(cur)) return cur;
    if (isFunctionBoundary(cur)) return undefined;
    cur = cur.getParent();
  }
  return undefined;
}

function loopLocation(node: Node): { startLine: number; endLine: number } {
  return { startLine: node.getStartLineNumber(), endLine: node.getEndLineNumber() };
}

function loopKey(node: Node): string {
  return `${node.getStartLineNumber()}:${node.getEndLineNumber()}`;
}

// ── Call expression helpers ───────────────────────────────────────────────────

function getMethodName(call: CallExpression): string {
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr) ? expr.getName() : "";
}

function getReceiverTypeText(call: CallExpression): string {
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return "";
  try {
    return expr.getExpression().getType().getText();
  } catch {
    return "";
  }
}

function usesHashLookup(node: Node): boolean {
  let found = false;
  node.forEachDescendant((child) => {
    if (found) return;
    if (!Node.isCallExpression(child)) return;
    const method = getMethodName(child);
    const rtype = getReceiverTypeText(child);
    if (
      (method === "has" || method === "get") &&
      (rtype.startsWith("Set<") || rtype.startsWith("Map<"))
    ) {
      found = true;
    }
  });
  return found;
}

// ── Detectors ─────────────────────────────────────────────────────────────────

const MEMBERSHIP_METHODS = new Set(["includes", "indexOf", "find", "findIndex"]);

/**
 * Detect Array membership checks (O(n)) inside a loop → O(n²) total.
 * Suggests converting to a Set/Map for O(1) lookup.
 */
export function detectMembershipInLoop(unit: AnalyzableUnit): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const reportedLoops = new Set<string>();

  unit.node.forEachDescendant((child) => {
    if (!Node.isCallExpression(child)) return;

    const method = getMethodName(child);
    if (!MEMBERSHIP_METHODS.has(method)) return;

    const rtype = getReceiverTypeText(child);
    // Skip if receiver is already a Set or Map (already O(1))
    if (rtype.startsWith("Set<") || rtype.startsWith("Map<")) return;
    // Skip plain string search — different optimization strategy
    if (rtype === "string" || rtype.startsWith('"')) return;

    const loop = getContainingLoopInScope(child);
    if (!loop) return;

    const key = loopKey(loop);
    if (reportedLoops.has(key)) return;
    reportedLoops.add(key);

    suggestions.push({
      pattern: "membership-in-loop",
      description: `Array.${method}() inside a loop causes O(n²) behaviour — build a Set once before the loop for O(1) lookups.`,
      rationale:
        "Array linear-search methods are O(n). Calling one inside an O(n) loop yields O(n²). Pre-building a Set reduces each lookup to O(1), making the total loop O(n).",
      currentComplexity: "O(n²)",
      projectedComplexity: "O(n)",
      location: loopLocation(loop),
      assumptions:
        "Set membership uses SameValueZero (===) equality. If a custom comparator is required, use a Map keyed by a derived value instead.",
    });
  });

  return suggestions;
}

/**
 * Detect Array.sort() called inside a loop.
 * Suggests hoisting the sort before the loop.
 */
export function detectSortInLoop(unit: AnalyzableUnit): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const reportedLoops = new Set<string>();

  unit.node.forEachDescendant((child) => {
    if (!Node.isCallExpression(child)) return;
    if (getMethodName(child) !== "sort") return;

    const loop = getContainingLoopInScope(child);
    if (!loop) return;

    const key = loopKey(loop);
    if (reportedLoops.has(key)) return;
    reportedLoops.add(key);

    suggestions.push({
      pattern: "sort-in-loop",
      description:
        "Array.sort() is called inside a loop — hoist the sort to before the loop to avoid O(n log n) work per iteration.",
      rationale:
        "Sorting is O(n log n). Inside an O(n) loop it becomes O(n² log n). If the array does not change between iterations, sorting once before the loop reduces total work to O(n log n + n).",
      currentComplexity: "O(n² log n)",
      projectedComplexity: "O(n log n)",
      location: loopLocation(loop),
      assumptions:
        "The array being sorted does not change between loop iterations. If it mutates each iteration, this optimization does not apply.",
    });
  });

  return suggestions;
}

/**
 * Detect Array.unshift() or Array.splice() for insertion inside a loop.
 * Both are O(n) per call because elements must shift. Suggests push + reverse.
 */
export function detectUnshiftSpliceInLoop(unit: AnalyzableUnit): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const reportedLoops = new Set<string>();

  unit.node.forEachDescendant((child) => {
    if (!Node.isCallExpression(child)) return;

    const method = getMethodName(child);
    if (method !== "unshift" && method !== "splice") return;

    const loop = getContainingLoopInScope(child);
    if (!loop) return;

    const key = loopKey(loop);
    if (reportedLoops.has(key)) return;
    reportedLoops.add(key);

    suggestions.push({
      pattern: "unshift-splice-in-loop",
      description: `Array.${method}() inside a loop is O(n) per call because all subsequent elements must shift — collect with push() and reverse() once after the loop instead.`,
      rationale:
        "Array.unshift() and Array.splice() shift all subsequent elements, making each call O(n). In an O(n) loop this produces O(n²) total. Collecting via push() (amortized O(1)) and reversing once gives O(n) total.",
      currentComplexity: "O(n²)",
      projectedComplexity: "O(n)",
      location: loopLocation(loop),
      assumptions:
        "The final element order can be obtained by reversing after all push() calls. If insertion order relative to other mutations requires in-place ordering, verify the reversal is correct.",
    });
  });

  return suggestions;
}

/**
 * Detect exponential recursion without visible memoization.
 * Suggests adding a Map-based memo cache.
 */
export function detectRecomputeInRecursion(
  unit: AnalyzableUnit,
  staticResult: StaticComplexityResult,
): OptimizationSuggestion[] {
  if (staticResult.recursion?.kind !== "exponential") return [];

  // Skip if memoization is already in place (Map/WeakMap construction or hash lookups)
  if (hasMemoization(unit) || usesHashLookup(unit.node)) return [];

  return [
    {
      pattern: "recompute-in-recursion",
      description: `${unit.name}() is exponentially recursive (O(2ⁿ)) — add a Map-based memo cache to avoid recomputing the same inputs.`,
      rationale:
        "Two recursive calls without input-halving leads to O(2ⁿ) repeated subproblem evaluation. Memoizing results in a Map keyed by the input reduces unique calls to O(n).",
      currentComplexity: "O(2ⁿ)",
      projectedComplexity: "O(n)",
      location: { startLine: unit.startLine, endLine: unit.endLine },
      assumptions:
        "The function is pure: identical inputs always produce identical outputs. Memoization changes observable behaviour if the function has side-effects or depends on mutable external state.",
    },
  ];
}

function hasMemoization(unit: AnalyzableUnit): boolean {
  let found = false;
  unit.node.forEachDescendant((child) => {
    if (found) return;
    if (Node.isNewExpression(child)) {
      const typeName = child.getExpression().getText();
      if (typeName === "Map" || typeName === "WeakMap") {
        found = true;
        return;
      }
    }
    if (Node.isVariableDeclaration(child)) {
      const name = child.getName().toLowerCase();
      if (name === "memo" || name === "cache" || name === "dp" || name === "memoize") {
        found = true;
      }
    }
  });
  return found;
}

/**
 * Detect nested explicit loops with no O(1) hash-based lookups.
 * Deduplicates against loops already flagged by membership-in-loop.
 */
export function detectNestedScan(
  unit: AnalyzableUnit,
  membershipLoopKeys: ReadonlySet<string>,
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const reportedOuters = new Set<string>();

  unit.node.forEachDescendant((outer) => {
    if (!isLoopNode(outer)) return;

    const outerKey = loopKey(outer);
    if (membershipLoopKeys.has(outerKey)) return; // already handled by membership-in-loop
    if (reportedOuters.has(outerKey)) return;

    // Find the first direct-child inner loop (no other loop or function boundary between them)
    let innerLoop: Node | undefined;
    outer.forEachDescendant((child) => {
      if (innerLoop) return;
      if (!isLoopNode(child)) return;
      let cur = child.getParent();
      while (cur && cur !== outer) {
        if (isLoopNode(cur) || isFunctionBoundary(cur)) return; // not a direct child
        cur = cur.getParent();
      }
      if (cur === outer) innerLoop = child;
    });

    if (!innerLoop) return;

    const innerKey = loopKey(innerLoop);
    if (membershipLoopKeys.has(innerKey)) return; // inner loop already covered

    // Skip if any O(1) hash lookups are already present — already (partially) optimal
    if (usesHashLookup(innerLoop)) return;

    reportedOuters.add(outerKey);

    suggestions.push({
      pattern: "nested-scan",
      description:
        "Nested loops scan both collections with O(n²) comparisons — pre-build a Set or Map from the inner collection for O(1) lookups.",
      rationale:
        "Iterating over n elements in an outer loop while scanning m elements in an inner loop costs O(n·m). Building a Set from one collection before the outer loop reduces each lookup to O(1), giving O(n + m) total.",
      currentComplexity: "O(n²)",
      projectedComplexity: "O(n)",
      location: loopLocation(outer),
      assumptions:
        "Elements are comparable with SameValueZero equality for Set keys. If a custom key or comparator is required, use a Map with a key-extraction function.",
    });
  });

  return suggestions;
}
