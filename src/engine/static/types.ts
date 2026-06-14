export type BigO = string;

export type Confidence = "high" | "medium" | "low";

export interface UncertainNode {
  description: string;
  line: number;
  col: number;
}

export type RecursionKind = "linear" | "divide-and-conquer" | "exponential" | "uncertain";

export interface RecursionInfo {
  kind: RecursionKind;
  rationale: string;
}

export interface StaticComplexityResult {
  timeComplexity: BigO;
  spaceComplexity: BigO;
  confidence: Confidence;
  uncertainNodes: UncertainNode[];
  recursion?: RecursionInfo;
}
