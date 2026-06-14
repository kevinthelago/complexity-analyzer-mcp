export type PatternKind =
  | "membership-in-loop"
  | "sort-in-loop"
  | "unshift-splice-in-loop"
  | "recompute-in-recursion"
  | "nested-scan";

export interface OptimizationSuggestion {
  /** Which anti-pattern this suggestion addresses */
  pattern: PatternKind;
  /** Short description of the issue and the recommended change */
  description: string;
  /** Why the fix is safe and what it achieves */
  rationale: string;
  /** Estimated complexity before applying the optimization */
  currentComplexity: string;
  /** Estimated complexity after applying the optimization */
  projectedComplexity: string;
  /** Source lines where the pattern was detected */
  location: { startLine: number; endLine: number };
  /** Behavioral assumption this suggestion makes, if any */
  assumptions?: string;
}

export interface SuggestionResult {
  /** Detected optimization opportunities, ordered by impact (most impactful first) */
  suggestions: OptimizationSuggestion[];
  /** High-level summary; 'no improvement found' when the function is already optimal */
  summary: string;
}
