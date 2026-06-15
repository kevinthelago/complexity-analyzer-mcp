import { z } from "zod";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { deepAnalyzeUnit } from "../../llm/index.js";
import type { McpTool, McpToolCallResult } from "../types.js";

// ── Input validation ──────────────────────────────────────────────────────────

/** Maximum source bytes accepted to guard against oversized input. */
const MAX_SOURCE_BYTES = 256 * 1024; // 256 KB

const inputSchema = z.object({
  code: z.string().optional(),
  filename: z.string().optional(),
});

const INPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    code: {
      type: "string",
      description: "TypeScript or JavaScript source code to analyse.",
    },
    filename: {
      type: "string",
      description: "Optional filename for language detection (e.g. 'index.ts').",
    },
  },
};

// ── Execute ───────────────────────────────────────────────────────────────────

async function execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
  let parsed: z.infer<typeof inputSchema>;
  try {
    parsed = inputSchema.parse(args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${msg}` }] };
  }

  if (!parsed.code) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "deep_analyze requires an inline `code` string (path support coming in a future version).",
        },
      ],
    };
  }

  if (Buffer.byteLength(parsed.code, "utf8") > MAX_SOURCE_BYTES) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Input exceeds the ${MAX_SOURCE_BYTES / 1024} KB limit.`,
        },
      ],
    };
  }

  const filename = parsed.filename ?? "input.ts";
  const parseResult = parseCode(parsed.code, filename);

  if (!parseResult.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Parse error: ${parseResult.parseError?.message ?? "unknown"}`,
        },
      ],
    };
  }

  if (parseResult.units.length === 0) {
    return {
      content: [{ type: "text", text: JSON.stringify([], null, 2) }],
    };
  }

  try {
    const results = await Promise.all(
      parseResult.units.map((unit) => deepAnalyzeUnit({ unit, staticResult: analyzeUnit(unit) })),
    );
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: "text", text: `LLM analysis failed: ${msg}` }] };
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/** MCP tool definition for deep_analyze — LLM-powered complexity verification pass. */
export const deepAnalyzeTool: McpTool = {
  name: "deep_analyze",
  description:
    "Analyse TypeScript/JavaScript code for time and space complexity using static analysis " +
    "followed by an LLM refinement pass. Returns Big-O estimates, confidence levels, " +
    "uncertain-node descriptions, and an optional more-efficient alternative implementation. " +
    "Requires ANTHROPIC_API_KEY.",
  inputSchema: INPUT_JSON_SCHEMA,
  execute,
};
