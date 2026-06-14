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
import type { Hotspot } from "./types.js";

export type { Hotspot } from "./types.js";

// ── BigO arithmetic (mirrors static/index.ts — kept local to avoid coupling) ─

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

function orderOf(bigo: string): number {
  return ORDER[bigo] ?? 3;
}

function dominantTerm(a: string, b: string): string {
  if (a === "unknown" || b === "unknown") return "unknown";
  return orderOf(a) >= orderOf(b) ? a : b;
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

function isDirectChildLoop(inner: Node, outer: Node): boolean {
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
      if (isLoopNode(child) && isDirectChildLoop(child, node)) {
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

// ── Call cost ────────────────────────────────────────────────────────────────

function resolveCallCost(call: CallExpression): string {
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

// ── Loop Big-O ───────────────────────────────────────────────────────────────

function computeLoopBigO(loop: LoopNode): string {
  const depth = maxLoopDepth(loop);
  let bigo = "O(1)";
  for (let d = 0; d < depth; d++) {
    bigo = multiplyLoop(bigo);
  }
  loop.forEachDescendant((child) => {
    if (Node.isCallExpression(child)) {
      const cost = resolveCallCost(child);
      if (cost !== "unknown") {
        bigo = dominantTerm(bigo, cost);
      }
    }
  });
  return bigo;
}

// ── Reason strings ────────────────────────────────────────────────────────────

function loopReason(loop: LoopNode, bigo: string): string {
  const depth = maxLoopDepth(loop);
  let kind: string;
  if (Node.isForOfStatement(loop) || Node.isForInStatement(loop)) {
    kind = "for-of/in";
  } else if (Node.isForStatement(loop)) {
    kind = "for";
  } else if (Node.isWhileStatement(loop)) {
    kind = "while";
  } else {
    kind = "do-while";
  }
  return depth > 1 ? `${depth}-deep ${kind} loop nesting → ${bigo}` : `${kind} loop → ${bigo}`;
}

function callReason(call: CallExpression, cost: string): string {
  const expr = call.getExpression();
  const name = Node.isPropertyAccessExpression(expr)
    ? `.${expr.getName()}()`
    : `${call.getExpression().getText()}()`;
  return `${name} costs ${cost}`;
}

// ── Snippet ───────────────────────────────────────────────────────────────────

function toSnippet(node: Node): string {
  return node.getText().replace(/\s+/g, " ").slice(0, 80);
}

// ── Uncertainty check ─────────────────────────────────────────────────────────

function overlapsUncertain(node: Node, result: StaticComplexityResult): boolean {
  if (result.uncertainNodes.length === 0) return false;
  const start = node.getStartLineNumber();
  const end = node.getEndLineNumber();
  return result.uncertainNodes.some((u) => u.line >= start && u.line <= end);
}

// ── Recursive call detection ──────────────────────────────────────────────────

function simpleName(qualifiedName: string): string {
  return qualifiedName.includes(".") ? (qualifiedName.split(".").at(-1) ?? qualifiedName) : qualifiedName;
}

function findRecursiveCallSites(unit: AnalyzableUnit): CallExpression[] {
  const self = simpleName(unit.name);
  const sites: CallExpression[] = [];
  unit.node.forEachDescendant((child) => {
    if (!Node.isCallExpression(child)) return;
    const expr = child.getExpression();
    const callee = Node.isIdentifier(expr)
      ? expr.getText()
      : Node.isPropertyAccessExpression(expr)
        ? expr.getName()
        : "";
    if (callee === self) sites.push(child);
  });
  return sites;
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Identify constructs within a unit whose individual Big-O matches the dominant
 * time complexity. Returns an empty list for O(1) units and unknown dominants.
 * Results are ranked worst-first; ties are broken by line number (ascending).
 */
export function findHotspots(unit: AnalyzableUnit, result: StaticComplexityResult): Hotspot[] {
  const dominant = result.timeComplexity;
  if (dominant === "O(1)" || dominant === "unknown") return [];

  const hotspots: Hotspot[] = [];

  if (result.recursion) {
    // Recursive units: each call-site is the hotspot driving the dominant term.
    for (const call of findRecursiveCallSites(unit)) {
      const pos = nodePosition(call);
      hotspots.push({
        line: pos.line,
        col: pos.col,
        snippet: toSnippet(call),
        bigO: dominant,
        reason: `Recursive call → ${dominant} (${result.recursion.rationale})`,
        uncertain: result.recursion.kind === "uncertain" || overlapsUncertain(call, result),
      });
    }
  } else {
    // Non-recursive units: collect loop and call hotspots.

    unit.node.forEachDescendant((child) => {
      if (!isLoopNode(child)) return;
      const bigo = computeLoopBigO(child);
      if (bigo !== dominant) return;
      const pos = nodePosition(child);
      hotspots.push({
        line: pos.line,
        col: pos.col,
        snippet: toSnippet(child),
        bigO: bigo,
        reason: loopReason(child, bigo),
        uncertain: overlapsUncertain(child, result),
      });
    });

    unit.node.forEachDescendant((child) => {
      if (!Node.isCallExpression(child)) return;
      const cost = resolveCallCost(child);
      if (cost === "O(1)" || cost === "unknown" || cost !== dominant) return;
      const pos = nodePosition(child);
      hotspots.push({
        line: pos.line,
        col: pos.col,
        snippet: toSnippet(child),
        bigO: cost,
        reason: callReason(child, cost),
        uncertain: overlapsUncertain(child, result),
      });
    });
  }

  hotspots.sort((a, b) => {
    const diff = orderOf(b.bigO) - orderOf(a.bigO);
    return diff !== 0 ? diff : a.line - b.line;
  });

  return hotspots;
}
