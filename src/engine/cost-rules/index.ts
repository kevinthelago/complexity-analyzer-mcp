import { COST_RULES } from "./rules.js";
import type { CostRule, LookupResult, UnknownComplexity } from "./types.js";

export type { Complexity, CostRule, LookupResult, UnknownComplexity } from "./types.js";
export { KB_VERSION } from "./rules.js";

const UNKNOWN: UnknownComplexity = {
  time: "unknown",
  space: "unknown",
  scalesIn: [],
  rationale: "No rule found for this operation; complexity cannot be determined statically.",
};

function buildIndex(rules: readonly CostRule[]): Map<string, CostRule[]> {
  const index = new Map<string, CostRule[]>();
  for (const rule of rules) {
    let list = index.get(rule.name);
    if (!list) {
      list = [];
      index.set(rule.name, list);
    }
    list.push(rule);
  }
  for (const [, list] of index) {
    list.sort((a, b) => (a.receiverType ? -1 : 0) - (b.receiverType ? -1 : 0));
  }
  return index;
}

const RULE_INDEX = buildIndex(COST_RULES);

/**
 * Look up complexity for a method call by name and optional receiver type text.
 * Falls back to syntactic match when type info is unavailable.
 * Returns explicit `unknown` — never silently returns O(1).
 */
export function lookupCost(methodName: string, receiverTypeText?: string): LookupResult {
  const rules = RULE_INDEX.get(methodName);
  if (!rules || rules.length === 0) return UNKNOWN;

  if (receiverTypeText) {
    const typed = rules.find(
      (r) => r.receiverType !== undefined && receiverTypeText.startsWith(r.receiverType),
    );
    if (typed) return typed.complexity;
  }

  const syntactic = rules.find((r) => r.receiverType === undefined) ?? rules[0];
  return syntactic ? syntactic.complexity : UNKNOWN;
}

export { COST_RULES };
