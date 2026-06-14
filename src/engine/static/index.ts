import {
  type CallExpression,
  type DoStatement,
  type ForInStatement,
  type ForOfStatement,
  type ForStatement,
  type NewExpression,
  Node,
  type WhileStatement,
} from "ts-morph";
import { lookupCost } from "../cost-rules/index.js";
import { nodePosition } from "../parser/index.js";
import type { AnalyzableUnit } from "../parser/types.js";
import type {
  Confidence,
  RecursionInfo,
  RecursionKind,
  StaticComplexityResult,
  UncertainNode,
} from "./types.js";

export type {
  BigO,
  Confidence,
  RecursionInfo,
  RecursionKind,
  StaticComplexityResult,
  UncertainNode,
} from "./types.js";

// ── BigO arithmetic ──────────────────────────────────────────────────────────

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

// ── Loop detection ───────────────────────────────────────────────────────────

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

function isAncestorLoop(inner: Node, outer: Node): boolean {
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
      // Only process loops whose immediate loop-ancestor is this node.
      if (isLoopNode(child) && isAncestorLoop(child, node)) {
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

// ── Call expression cost ─────────────────────────────────────────────────────

function callCost(call: CallExpression): string {
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

// ── Allocation space estimation ──────────────────────────────────────────────

function estimateAllocationSpace(node: Node): string {
  let hasLinearAlloc = false;
  let hasNlogN = false;

  node.forEachDescendant((child) => {
    if (Node.isArrayLiteralExpression(child)) {
      hasLinearAlloc = true;
    } else if (Node.isNewExpression(child)) {
      const typeName = (child as NewExpression).getExpression().getText();
      if (typeName === "Array" || typeName === "Map" || typeName === "Set") {
        hasLinearAlloc = true;
      }
    } else if (Node.isCallExpression(child)) {
      const cost = callCost(child);
      if (cost === "O(n log n)") hasNlogN = true;
      if (cost === "O(n)" || cost === "O(n+m)" || cost === "O(n·m)") hasLinearAlloc = true;
    }
  });

  if (hasNlogN) return "O(log n)";
  if (hasLinearAlloc) return "O(n)";
  return "O(1)";
}

// ── Recursion detection ──────────────────────────────────────────────────────

function detectRecursion(unit: AnalyzableUnit): RecursionInfo | undefined {
  const simpleName = unit.name.includes(".")
    ? (unit.name.split(".").at(-1) ?? unit.name)
    : unit.name;

  const recurSites: CallExpression[] = [];
  unit.node.forEachDescendant((child) => {
    if (Node.isCallExpression(child)) {
      const expr = child.getExpression();
      const callName = Node.isIdentifier(expr)
        ? expr.getText()
        : Node.isPropertyAccessExpression(expr)
          ? expr.getName()
          : "";
      if (callName === simpleName) recurSites.push(child);
    }
  });

  if (recurSites.length === 0) return undefined;

  let kind: RecursionKind = "uncertain";
  let rationale = "Recursive structure not classified.";

  if (recurSites.length >= 2) {
    // Check direct argument text for halving patterns
    const hasDirectHalving = recurSites.some((site) =>
      site.getArguments().some((a) => {
        const text = a.getText();
        return (
          text.includes("/ 2") ||
          text.includes("/2") ||
          text.includes(">> 1") ||
          text.includes("Math.floor") ||
          text.includes("Math.ceil")
        );
      }),
    );

    // Check for a local variable assigned via halving (e.g. `const mid = Math.floor(n/2)`)
    // and referenced in recursive call arguments (e.g. via `.slice(0, mid)`)
    let halvingVarName: string | undefined;
    unit.node.forEachDescendant((child) => {
      if (halvingVarName) return;
      if (Node.isVariableDeclaration(child)) {
        const init = child.getInitializer();
        if (init) {
          const t = init.getText();
          if (
            t.includes("/ 2") ||
            t.includes("/2") ||
            t.includes("Math.floor") ||
            t.includes("Math.ceil")
          ) {
            halvingVarName = child.getName();
          }
        }
      }
    });

    const hasIndirectHalving =
      halvingVarName !== undefined &&
      recurSites.some((site) =>
        site.getArguments().some((a) => {
          const text = a.getText();
          return text.includes(halvingVarName as string) || text.includes(".slice(");
        }),
      );

    if (hasDirectHalving || hasIndirectHalving) {
      kind = "divide-and-conquer";
      rationale = "Two recursive calls with halved input → O(n log n) by Master Theorem.";
    } else {
      kind = "exponential";
      rationale = "Two recursive calls without input halving → O(2ⁿ) exponential growth.";
    }
  } else {
    const singleSite = recurSites[0];
    if (singleSite) {
      const hasLinearDec = singleSite.getArguments().some((a) => {
        const text = a.getText();
        return (
          text.includes("- 1") || text.includes("-1") || text.includes("+ 1") || text.includes("+1")
        );
      });
      if (hasLinearDec) {
        kind = "linear";
        rationale = "Single recursive call with n±1 → linear O(n) recursion.";
      } else {
        kind = "uncertain";
        rationale = "Single recursive call; cannot determine input reduction pattern.";
      }
    }
  }

  return { kind, rationale };
}

function recursionTimeComplexity(rec: RecursionInfo): string {
  switch (rec.kind) {
    case "linear":
      return "O(n)";
    case "divide-and-conquer":
      return "O(n log n)";
    case "exponential":
      return "O(2ⁿ)";
    case "uncertain":
      return "unknown";
  }
}

function recursionSpaceComplexity(rec: RecursionInfo): string {
  switch (rec.kind) {
    case "linear":
      return "O(n)";
    case "divide-and-conquer":
      return "O(log n)";
    case "exponential":
      return "O(2ⁿ)";
    case "uncertain":
      return "unknown";
  }
}

// ── Main analysis ────────────────────────────────────────────────────────────

/**
 * Analyse a single analyzable unit and return its static complexity estimate.
 * Never throws; uncertain nodes are collected and reported.
 */
export function analyzeUnit(unit: AnalyzableUnit): StaticComplexityResult {
  const uncertainNodes: UncertainNode[] = [];

  // 1. Recursion check
  const recursion = detectRecursion(unit);
  if (recursion) {
    const timeC = recursionTimeComplexity(recursion);
    const spaceC = recursionSpaceComplexity(recursion);
    const confidence: Confidence = recursion.kind === "uncertain" ? "low" : "medium";
    if (recursion.kind === "uncertain") {
      const pos = nodePosition(unit.node);
      uncertainNodes.push({
        description: `Recursive call to '${unit.name}'; input-reduction pattern unrecognized.`,
        line: pos.line,
        col: pos.col,
      });
    }
    return {
      timeComplexity: timeC,
      spaceComplexity: spaceC,
      confidence,
      uncertainNodes,
      recursion,
    };
  }

  // 2. Loop nesting depth → time complexity
  const loopDepth = maxLoopDepth(unit.node);
  let timeComplexity = "O(1)";
  for (let d = 0; d < loopDepth; d++) {
    timeComplexity = multiplyLoop(timeComplexity);
  }

  // 3. Call expression costs (sequential dominant term)
  unit.node.forEachDescendant((child) => {
    if (Node.isCallExpression(child)) {
      const cost = callCost(child);
      if (cost === "unknown") {
        const pos = nodePosition(child);
        uncertainNodes.push({
          description: `Unknown cost for call: ${child.getText().slice(0, 60)}`,
          line: pos.line,
          col: pos.col,
        });
      } else {
        timeComplexity = dominantTerm(timeComplexity, cost);
      }
    }
  });

  // 4. Space from allocations
  const spaceComplexity = estimateAllocationSpace(unit.node);

  // 5. Confidence
  let confidence: Confidence = "high";
  if (uncertainNodes.length > 0) confidence = "low";
  else if (loopDepth > 2) confidence = "medium";

  return { timeComplexity, spaceComplexity, confidence, uncertainNodes };
}
