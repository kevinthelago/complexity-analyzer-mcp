import type { StaticPassResult } from "../schema/internal.js";
import type { ParsedUnit } from "../schema/internal.js";

// Stub — engine-spine (CA-4) provides the real implementation.

export function staticPass(
  _unit: ParsedUnit,
  _opts: { typeInfoAvailable: boolean },
): StaticPassResult {
  throw new Error("Static pass not yet implemented (engine-spine CA-4)");
}
