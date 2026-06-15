import {
  type CallExpression,
  type DoStatement,
  type ForInStatement,
  type ForOfStatement,
  type ForStatement,
  Node,
  type WhileStatement,
} from "ts-morph";
import { lookupCost } from "../cost-rules/index.js";
import { nodePosition } from "../parser/index.js";
import type { AnalyzableUnit } from "../parser/types.js";
import type { StaticComplexityResult } from "../static/types.js";
import type { Hotspot, HotspotKind } from "./types.js";

export type { Hotspot, HotspotKind } from "./types.js";

const ORDER: Record<string, number> = {
  "O(1)": 1,
  "O(log n)": 2,
  "O(n)": 3,
  "O(n log n)": 4,
  "O(n²)": 5,
  "O(n³)": 6,
  "O(2ⁿ)": 7,
  unknown: 99,
};

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

/** True when `inner` is a direct loop child of `outer` (no intervening loop). */
function isDirectLoopChild(inner: Node, outer: Node): boolean {
  let cur = inner.getParent();
  while (cur) {
    if (cur === outer) return true;
    if (isLoopNode(cur)) return false;
    cur = cur.getParent();
  }
  return false;
}

function maxLoopDepth(node: Node): number {
  if (isLoopNode(node)) {
    let maxChild = 0;
    node.forEachDescendant((child) => {
      if (isLoopNode(child) && isDirectLoopChild(child, node)) {
        const d = maxLoopDepth(child);
        if (d > maxChild) maxChild = d;
      }
    });
    return 1 + maxChild;
  }
  let max = 0;
  node.forEachDescendant((child) => {
    if (isLoopNode(child)) {
      const d = maxLoopDepth(child);
      if (d > max) max = d;
    }
  });
  return max;
}

function multiplyLoop(inner: string): string {
  if (inner === "O(1)") return "O(n)";
  if (inner === "O(log n)") return "O(n log n)";
  if (inner === "O(n)") return "O(n²)";
  if (inner === "O(n²)") return "O(n³)";
  if (inner === "O(n log n)") return "O(n²)";
  if (inner === "unknown") return "unknown";
  return "O(n²)";
}

function loopNodeCost(node: Node): string {
  const depth = maxLoopDepth(node);
  let cost = "O(1)";
  for (let d = 0; d < depth; d++) {
    cost = multiplyLoop(cost);
  }
  return cost;
}

function loopKindLabel(node: Node): string {
  if (Node.isForStatement(node)) return "for loop";
  if (Node.isForOfStatement(node)) return "for...of loop";
  if (Node.isForInStatement(node)) return "for...in loop";
  if (Node.isWhileStatement(node)) return "while loop";
  if (Node.isDoStatement(node)) return "do...while loop";
  return "loop";
}

function callExprCost(call: CallExpression): string {
  const expr = call.getExpression();
  if (Node.isPropertyAccessExpression(expr)) {
    const methodName = expr.getName();
    const obj = expr.getExpression();
    let receiverTypeText: string | undefined;
    try {
      receiverTypeText = obj.getType().getText();
    } catch {
      // no type info
    }
    return lookupCost(methodName, receiverTypeText).time;
  }
  return "O(1)";
}

/**
 * Return the hotspots (costly constructs) in `unit` whose individual Big-O
 * matches the unit's dominant time complexity. Ranked worst-first; stable on ties.
 */
export function findHotspots(
  unit: AnalyzableUnit,
  staticResult: StaticComplexityResult,
): Hotspot[] {
  const dominant = staticResult.timeComplexity;
  if (dominant === "O(1)") return [];

  const dominantOrder = ORDER[dominant] ?? 3;
  const uncertainLineSet = new Set(staticResult.uncertainNodes.map((u) => u.line));
  const hotspots: Hotspot[] = [];

  // 1. Top-level loops (no ancestor loop between the node and unit.node).
  unit.node.forEachDescendant((child) => {
    if (!isLoopNode(child)) return;

    let parent = child.getParent();
    let nested = false;
    while (parent && parent !== unit.node) {
      if (isLoopNode(parent)) {
        nested = true;
        break;
      }
      const next = parent.getParent();
      if (!next) break;
      parent = next;
    }
    if (nested) return;

    const cost = loopNodeCost(child);
    const costOrder = ORDER[cost] ?? 3;
    if (costOrder < dominantOrder) return;

    const pos = nodePosition(child);
    const depth = maxLoopDepth(child);
    const kind: HotspotKind = depth > 1 ? "loop-nest" : "loop-nest";
    const reason =
      depth > 1
        ? `${depth}-level nested loop contributes ${cost}`
        : `${loopKindLabel(child)} contributes ${cost}`;

    hotspots.push({
      kind,
      line: pos.line,
      col: pos.col,
      snippet: child.getText().split("\n")[0]?.slice(0, 120) ?? "",
      bigO: cost,
      reason,
      uncertain: uncertainLineSet.has(pos.line),
    });
  });

  // 2. Expensive call expressions (independent of loop detection).
  unit.node.forEachDescendant((child) => {
    if (!Node.isCallExpression(child)) return;
    const cost = callExprCost(child);
    if (cost === "O(1)" || cost === "unknown") return;
    const costOrder = ORDER[cost] ?? 3;
    if (costOrder < dominantOrder) return;

    const expr = child.getExpression();
    const methodName = Node.isPropertyAccessExpression(expr)
      ? `.${expr.getName()}()`
      : child.getText().slice(0, 30);

    const pos = nodePosition(child);
    hotspots.push({
      kind: "costly-call",
      line: pos.line,
      col: pos.col,
      snippet: child.getText().slice(0, 120),
      bigO: cost,
      reason: `Call to ${methodName} has cost ${cost}`,
      uncertain: uncertainLineSet.has(pos.line),
    });
  });

  // Sort: worst-first; ties stable by line then col.
  return hotspots.sort((a, b) => {
    const oa = ORDER[a.bigO] ?? 3;
    const ob = ORDER[b.bigO] ?? 3;
    if (ob !== oa) return ob - oa;
    if (a.line !== b.line) return a.line - b.line;
    return a.col - b.col;
  });
}

export interface GlobalHotspot extends Hotspot {
  unitName: string;
  filename?: string;
}

/**
 * Aggregate hotspots from multiple analysis results into a single globally
 * ranked list (worst-first, ties broken by unitName then line then col).
 *
 * Accepts an array of { units, filename? } pairs where each unit carries a
 * populated `hotspots` array (as produced by the pipeline stage).
 */
export function rankHotspotsGlobally(
  results: Array<{ units: Array<{ name: string; hotspots: Hotspot[] }>; filename?: string }>,
): GlobalHotspot[] {
  const all: GlobalHotspot[] = [];

  for (const { units, filename } of results) {
    for (const unit of units) {
      for (const hotspot of unit.hotspots) {
        const entry: GlobalHotspot = { ...hotspot, unitName: unit.name };
        if (filename !== undefined) entry.filename = filename;
        all.push(entry);
      }
    }
  }

  return all.sort((a, b) => {
    const oa = ORDER[a.bigO] ?? 3;
    const ob = ORDER[b.bigO] ?? 3;
    if (ob !== oa) return ob - oa;
    const ua = a.unitName.toLowerCase();
    const ub = b.unitName.toLowerCase();
    if (ua !== ub) return ua < ub ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.col - b.col;
  });
}
