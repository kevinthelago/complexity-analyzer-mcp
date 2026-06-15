import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";
import { findHotspots } from "../../engine/hotspots/index.js";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { suggestOptimizations } from "../../engine/suggest/index.js";
import { deepAnalyzeUnit } from "../../llm/index.js";
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
      "Optional filename hint for language detection (e.g. 'index.ts'). Defaults to the basename of path, or 'input.ts'.",
    ),
};

async function execute(args: ToolArgs<typeof inputShape>) {
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

  const parsed = parseCode(source, resolvedFilename);

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

  const results = await Promise.all(
    parsed.units.map((unit) => {
      const staticResult = analyzeUnit(unit);
      const hotspots = findHotspots(unit, staticResult);
      const suggestions = suggestOptimizations(unit, staticResult);
      return deepAnalyzeUnit({ unit, staticResult, hotspots, suggestions });
    }),
  );

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ units: results }, null, 2) }],
  };
}

const tool: ToolDefinition<typeof inputShape> = {
  name: "deep_analyze",
  description:
    "Analyse TypeScript or JavaScript code for time and space complexity using static analysis " +
    "followed by an LLM reasoning pass. Returns Big-O estimates, confidence levels, " +
    "LLM-verified complexities, hotspots, optimization suggestions, and an optional " +
    "more-efficient alternative implementation. " +
    "Supply either code (inline source) or path (file path); code takes precedence when both are given. " +
    "Requires ANTHROPIC_API_KEY; degrades gracefully to static-only analysis when unavailable.",
  inputShape,
  execute,
};

export default tool;
