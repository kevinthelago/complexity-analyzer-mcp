import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
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

  const units = parsed.units.map((unit) => {
    const r = analyzeUnit(unit);
    const entry: Record<string, unknown> = {
      kind: unit.kind,
      name: unit.name,
      startLine: unit.startLine,
      endLine: unit.endLine,
      timeComplexity: r.timeComplexity,
      spaceComplexity: r.spaceComplexity,
      confidence: r.confidence,
      uncertainNodes: r.uncertainNodes,
    };
    if (r.recursion !== undefined) entry.recursion = r.recursion;
    return entry;
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ file: filename, units }, null, 2) }],
  };
}

/** MCP tool definition for analyze_complexity. */
export const analyzeComplexityTool: McpTool = {
  name: "analyze_complexity",
  description:
    "Analyze TypeScript/JavaScript source code and return the time complexity, space complexity, and confidence for each function or method.",
  inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
  execute,
};
