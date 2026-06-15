import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { suggestOptimizations } from "../../engine/suggest/index.js";
import type { McpTool, McpToolCallResult } from "../types.js";

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    code: {
      type: "string",
      description: "TypeScript or JavaScript source code to analyze.",
    },
    filename: {
      type: "string",
      description:
        "Optional filename for language detection (e.g. 'index.ts'). Defaults to 'input.ts'.",
    },
  },
  required: ["code"],
} as const;

function execute(args: Record<string, unknown>): McpToolCallResult {
  const code = args.code;
  const rawFilename = args.filename;
  const filename = typeof rawFilename === "string" ? rawFilename : "input.ts";

  if (typeof code !== "string") {
    return {
      isError: true,
      content: [{ type: "text", text: "Error: 'code' must be a string" }],
    };
  }

  const parsed = parseCode(code, filename);

  if (!parsed.success) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Parse error: ${parsed.parseError?.message ?? "unknown error"}`,
        },
      ],
    };
  }

  if (parsed.units.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ suggestions: [], summary: "no improvement found" }, null, 2),
        },
      ],
    };
  }

  const allSuggestions = parsed.units.flatMap((unit) => {
    const staticResult = analyzeUnit(unit);
    const { suggestions } = suggestOptimizations(unit, staticResult);
    return suggestions.map((s) => ({ ...s, functionName: unit.name }));
  });

  const result = {
    suggestions: allSuggestions,
    summary:
      allSuggestions.length > 0
        ? `Found ${allSuggestions.length} optimization ${allSuggestions.length === 1 ? "opportunity" : "opportunities"}.`
        : "no improvement found",
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

/** MCP tool definition for suggest_optimizations. */
export const suggestOptimizationsTool: McpTool = {
  name: "suggest_optimizations",
  description:
    "Analyze TypeScript/JavaScript code for performance anti-patterns and suggest data-structure or algorithmic optimizations with projected Big-O improvements.",
  inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
  execute,
};
