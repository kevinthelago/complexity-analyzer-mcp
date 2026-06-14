import type { BigO, Confidence, ParseError, UncertainNode } from "./types.js";

/** Per-node cost contribution emitted by the static pass. */
export type PerNodeCost = {
  line: number;
  column: number;
  snippet: string;
  timeCost: BigO;
  spaceCost: BigO;
  reason: string;
};

/** Output of the static complexity pass for a single analyzable unit. */
export type StaticPassResult = {
  time: BigO;
  space: BigO;
  confidence: Confidence;
  perNodeCosts: PerNodeCost[];
  uncertainNodes: UncertainNode[];
};

/** A single analyzable unit (function, method, arrow fn, or top-level block) from the parser. */
export type ParsedUnit = {
  name: string;
  line: number;
  column: number;
  source: string;
};

/** Output of parsing a source string or file. */
export type ParsedSource = {
  units: ParsedUnit[];
  parseError?: ParseError;
  typeInfoAvailable: boolean;
  lang: string;
};
