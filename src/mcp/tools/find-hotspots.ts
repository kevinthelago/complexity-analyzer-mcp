import { z } from "zod";
import { parseCode } from "../../engine/parser/index.js";
import { analyzeUnit } from "../../engine/static/index.js";
import type { ToolArgs, ToolDefinition } from "../types.js";

const MAX_SOURCE_BYTES = 256 * 1024;
const DEFAULT_TOP_N = 5;
const MAX_TOP_N = 50;

// Higher number = worse complexity. Used for ranking hotspots.
const SEVERITY: Record<string, number> = {
  "O(2ⁿ)": 7,
  "O(n³)": 6,
  "O(n²)": 5,
  "O(n log n)": 4,
  unknown: 3,
  "O(n)": 2,
  "O(log n)": 1,
  "O(1)": 0,
};

function severityOf(bigO: string): number {
  return SEVERITY[bigO] ?? 3;
}

const inputShape = {
  code: z.string().describe("TypeScript or JavaScript source code to analyse."),
  filename: z
    .string()
    .optional()
    .describe(
      "Optional filename for language detection (e.g. 'input.ts'). Defaults to 'input.ts'.",
    ),
  topN: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_N)
    .optional()
    .describe(
      `Number of hotspot functions to return (default: ${DEFAULT_TOP_N}, max: ${MAX_TOP_N}).`,
    ),
};

function execute(args: ToolArgs<typeof inputShape>) {
  const { code } = args;
  const filename = args.filename ?? "input.ts";
  const topN = args.topN ?? DEFAULT_TOP_N;

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
            { hotspots: [], message: "No analyzable functions or methods found." },
            null,
            2,
          ),
        },
      ],
    };
  }

  const scored = parsed.units.map((unit) => {
    const r = analyzeUnit(unit);
    const timeSeverity = severityOf(r.timeComplexity);
    const spaceSeverity = severityOf(r.spaceComplexity);
    const confidencePenalty = r.confidence === "high" ? 0 : r.confidence === "medium" ? -0.1 : -0.2;
    const score = timeSeverity + spaceSeverity * 0.5 + confidencePenalty;
    return { unit, result: r, score };
  });

  scored.sort((a, b) => b.score - a.score || a.unit.startLine - b.unit.startLine);

  const hotspots = scored.slice(0, topN).map(({ unit, result, score: _score }) => ({
    name: unit.name,
    kind: unit.kind,
    startLine: unit.startLine,
    endLine: unit.endLine,
    timeComplexity: result.timeComplexity,
    spaceComplexity: result.spaceComplexity,
    confidence: result.confidence,
    ...(result.recursion !== undefined ? { recursion: result.recursion } : {}),
    uncertainNodes: result.uncertainNodes,
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ hotspots, totalFunctions: parsed.units.length }, null, 2),
      },
    ],
  };
}

const tool: ToolDefinition<typeof inputShape> = {
  name: "find_hotspots",
  description:
    "Identify the most algorithmically expensive functions in TypeScript or JavaScript code. " +
    "Returns up to topN functions ranked by time complexity severity (worst first), " +
    "with space complexity, confidence, and recursion info where detected.",
  inputShape,
  execute,
};

export default tool;
