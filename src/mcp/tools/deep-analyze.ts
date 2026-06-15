/**
 * Self-registering deep_analyze MCP tool.
 *
 * The tool registry (CA-7, src/mcp/registry.ts) auto-discovers modules under
 * src/mcp/tools/ and expects each to default-export a ToolDefinition.
 * The ToolDefinition type below mirrors the shape CA-7 will define in
 * src/mcp/types.ts — reconcile imports once that module lands.
 */
import { z } from "zod";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { deepAnalyzeUnit } from "../../llm/index.js";
import type { DeepAnalyzeResult } from "../../llm/types.js";

// ── Input schema ──────────────────────────────────────────────────────────────

/** Maximum source bytes accepted to guard against oversized input. */
const MAX_SOURCE_BYTES = 256 * 1024; // 256 KB

const inputSchema = z.object({
  /** Inline source code to analyse. Mutually exclusive with `path`. */
  code: z.string().optional(),
  /** Filename hint — used only for syntax-mode selection (`.ts` vs `.js`). */
  filename: z.string().optional(),
});

// ── ToolDefinition stub ───────────────────────────────────────────────────────
// Shape aligned with CA-7's planned registry contract.
// TODO: replace with `import type { ToolDefinition } from "../types.js"` once CA-7 lands.

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: unknown) => Promise<unknown>;
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function handler(rawInput: unknown): Promise<DeepAnalyzeResult[]> {
  const input = inputSchema.parse(rawInput);

  if (!input.code) {
    throw new Error(
      "deep_analyze requires an inline `code` string (path support added in a future version)",
    );
  }

  if (Buffer.byteLength(input.code, "utf8") > MAX_SOURCE_BYTES) {
    throw new Error(`Input exceeds the ${MAX_SOURCE_BYTES / 1024} KB limit`);
  }

  const filename = input.filename ?? "input.ts";
  const parsed = parseCode(input.code, filename);

  if (!parsed.success) {
    throw new Error(`Parse error: ${parsed.parseError?.message ?? "unknown"}`);
  }

  if (parsed.units.length === 0) {
    return [];
  }

  const results = await Promise.all(
    parsed.units.map((unit) => deepAnalyzeUnit({ unit, staticResult: analyzeUnit(unit) })),
  );

  return results;
}

// ── Export ────────────────────────────────────────────────────────────────────

const tool: ToolDefinition = {
  name: "deep_analyze",
  description:
    "Analyse TypeScript/JavaScript code for time and space complexity using static analysis " +
    "followed by an LLM refinement pass. Returns Big-O estimates, confidence levels, " +
    "uncertain-node descriptions, and an optional more-efficient alternative implementation.",
  inputSchema,
  handler,
};

export default tool;
