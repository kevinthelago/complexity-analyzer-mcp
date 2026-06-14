import type { ParsedSource } from "../schema/internal.js";

// Stub — engine-spine (CA-2) provides the real implementation.
// These signatures define the contract this stream builds against.

export function parse(_source: string, _options: { lang: string }): ParsedSource {
  throw new Error("Parser not yet implemented (engine-spine CA-2)");
}

export async function parseFile(_path: string): Promise<ParsedSource> {
  throw new Error("parseFile not yet implemented (engine-spine CA-2)");
}
