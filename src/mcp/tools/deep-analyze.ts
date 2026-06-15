import { z } from "zod";
import { findHotspots } from "../../engine/hotspots/index.js";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import { suggestOptimizations } from "../../engine/suggest/index.js";
import { deepAnalyzeUnit } from "../../llm/index.js";
import type { ToolArgs, ToolDefinition } from "../types.js";

const MAX_SOURCE_BYTES = 256 * 1024;

const inputShape = {
  code: z.string().describe("TypeScript or JavaScript source code to analyse."),
  filename: z
    .string()
    .optional()
    .describe("Optional filename for language detection (e.g. 'index.ts')."),
};

async function execute(args: ToolArgs<typeof inputShape>) {
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
    "Requires ANTHROPIC_API_KEY or OPENAI_API_KEY; degrades gracefully to static-only analysis when unavailable.",
  inputShape,
  execute,
};

export default tool;
