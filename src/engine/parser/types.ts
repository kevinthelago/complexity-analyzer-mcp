import type { Node, Type } from "ts-morph";

export interface ParseError {
  message: string;
  line?: number;
  col?: number;
}

export type UnitKind = "function" | "method" | "arrow" | "constructor";

export interface AnalyzableUnit {
  kind: UnitKind;
  name: string;
  startLine: number;
  endLine: number;
  /** ts-morph node for downstream analysis */
  node: Node;
  /** Type from the ts-morph type-checker, if available */
  returnType?: Type;
}

export interface ParseResult {
  success: boolean;
  parseError?: ParseError;
  units: AnalyzableUnit[];
  typeInfoAvailable: boolean;
}
