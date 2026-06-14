export interface Complexity {
  time: string;
  space: string;
  /** Variable(s) complexity scales in, e.g. ["n"] or ["n", "m"] */
  scalesIn: string[];
  /** Human-readable rationale for the rule */
  rationale: string;
}

export interface UnknownComplexity {
  time: "unknown";
  space: "unknown";
  scalesIn: [];
  rationale: string;
}

export type LookupResult = Complexity | UnknownComplexity;

export interface CostRule {
  /** Method/property name, e.g. "push", "sort" */
  name: string;
  /** Receiver type constraint, e.g. "Array", "Set", "Map" */
  receiverType?: string;
  complexity: Complexity;
}
