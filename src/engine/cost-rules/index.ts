import type { BigO } from "../schema/types.js";

// Stub — engine-spine (CA-3) provides the real implementation.

export const KB_VERSION = "1.0.0";

export type OperationCost = {
  time: BigO;
  space: BigO;
  scalesIn: string;
  rationale: string;
};

export function lookupCost(_operation: string, _receiverType?: string): OperationCost | null {
  throw new Error("Cost-rules not yet implemented (engine-spine CA-3)");
}
