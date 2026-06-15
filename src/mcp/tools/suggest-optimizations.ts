import { z } from "zod";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { suggestOptimizations } from "../../engine/suggest/index.js";
import type { ToolArgs, ToolDefinition } from "../types.js";

const inputShape = {
  code: z.string().describe("TypeScript or JavaScript source code to analyse."),
  filename: z
    .string()
    .optional()
    .describe(
      "Optional filename for language detection (e.g. 'index.ts'). Defaults to 'input.ts'.",
    ),
};

function execute(args: ToolArgs<typeof inputShape>) {
  const { code } = args;
  const filename = args.filename ?? "input.ts";

  const parsed = parseCode(code, filename);

  if (!parsed.success) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `Parse error: ${parsed.parseError?.message ?? "unknown error"}`,
        },
      ],
    };
  }

  if (parsed.units.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
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
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

const tool: ToolDefinition<typeof inputShape> = {
  name: "suggest_optimizations",
  description:
    "Analyze TypeScript/JavaScript code for performance anti-patterns and suggest data-structure " +
    "or algorithmic optimizations with projected Big-O improvements.",
  inputShape,
  execute,
};

export default tool;
