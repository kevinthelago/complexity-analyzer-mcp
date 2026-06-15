import { z } from "zod";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import type { ToolArgs, ToolDefinition } from "../types.js";

const MAX_SOURCE_BYTES = 256 * 1024;

const inputShape = {
  code: z.string().describe("TypeScript or JavaScript source code to analyse."),
  filename: z
    .string()
    .optional()
    .describe(
      "Optional filename for language detection (e.g. 'input.ts'). Defaults to 'input.ts'.",
    ),
};

function execute(args: ToolArgs<typeof inputShape>) {
  const { code } = args;
  const filename = args.filename ?? "input.ts";

  if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `Error: input exceeds the ${MAX_SOURCE_BYTES / 1024} KB limit`,
        },
      ],
    };
  }

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
          text: JSON.stringify(
            { units: [], message: "No analyzable functions or methods found." },
            null,
            2,
          ),
        },
      ],
    };
  }

  const units = parsed.units.map((unit) => {
    const r = analyzeUnit(unit);
    return {
      name: unit.name,
      kind: unit.kind,
      startLine: unit.startLine,
      endLine: unit.endLine,
      timeComplexity: r.timeComplexity,
      spaceComplexity: r.spaceComplexity,
      confidence: r.confidence,
      uncertainNodes: r.uncertainNodes,
      ...(r.recursion !== undefined ? { recursion: r.recursion } : {}),
    };
  });

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ units }, null, 2) }],
  };
}

const tool: ToolDefinition<typeof inputShape> = {
  name: "analyze_complexity",
  description:
    "Analyse TypeScript or JavaScript code and return time/space Big-O complexity estimates, " +
    "confidence levels, and uncertain-construct descriptions for every function, method, " +
    "arrow function, and constructor in the source.",
  inputShape,
  execute,
};

export default tool;
