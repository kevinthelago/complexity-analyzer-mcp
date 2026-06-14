import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { suggestOptimizations } from "../../engine/suggest/index.js";

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

type SuggestInput = { code: string; filename?: string };

function execute(args: SuggestInput) {
  const filename = args.filename ?? "input.ts";
  const parsed = parseCode(args.code, filename);

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

/** Self-registering MCP tool definition for the suggest_optimizations tool. */
export const suggestOptimizationsTool = {
  name: "suggest_optimizations" as const,
  description:
    "Analyze TypeScript/JavaScript code for performance anti-patterns and suggest data-structure or algorithmic optimizations with projected Big-O improvements.",
  inputSchema: INPUT_SCHEMA,
  execute,
} as const;
