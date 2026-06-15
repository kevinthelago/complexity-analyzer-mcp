import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { runPipeline } from "../../engine/pipeline/index.js";
import type { ToolArgs, ToolDefinition } from "../types.js";

const MAX_SOURCE_BYTES = 256 * 1024;

const inputShape = {
  code: z
    .string()
    .optional()
    .describe(
      "TypeScript or JavaScript source code to analyse. Takes precedence over path when both are provided.",
    ),
  path: z
    .string()
    .optional()
    .describe("Absolute path to a TypeScript or JavaScript source file to read and analyse."),
  filename: z
    .string()
    .optional()
    .describe(
      "Optional filename hint for language detection (e.g. 'input.ts'). Defaults to the basename of path, or 'input.ts'.",
    ),
};

function execute(args: ToolArgs<typeof inputShape>) {
  let source: string;
  let resolvedFilename: string;

  if (args.code !== undefined) {
    source = args.code;
    resolvedFilename = args.filename ?? "input.ts";
  } else if (args.path !== undefined) {
    try {
      source = readFileSync(args.path, "utf8");
    } catch (err) {
      return {
        isError: true as const,
        content: [
          {
            type: "text" as const,
            text: `Error: could not read "${args.path}": ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
    resolvedFilename = args.filename ?? basename(args.path);
  } else {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: "Error: either code or path must be provided.",
        },
      ],
    };
  }

  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
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

  const result = runPipeline(source, { filename: resolvedFilename });

  if (result.parseError) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: `Parse error: ${result.parseError}`,
        },
      ],
    };
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}

const tool: ToolDefinition<typeof inputShape> = {
  name: "analyze_complexity",
  description:
    "Analyse TypeScript or JavaScript code and return a full AnalysisResult: time/space Big-O, " +
    "confidence, hotspots, uncertain-construct descriptions, and metadata for every function, " +
    "method, arrow function, and constructor in the source. Supply either code (inline source) or " +
    "path (file path); code takes precedence when both are given.",
  inputShape,
  execute,
};

export default tool;
