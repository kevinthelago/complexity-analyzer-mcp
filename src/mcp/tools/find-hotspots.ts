import { z } from "zod";
import { resolveInput } from "../../engine/input/index.js";
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

/** True when `p` contains glob metacharacters and should be treated as a pattern. */
function isGlobPattern(p: string): boolean {
  return /[*?{}[\]]/.test(p);
}

const inputShape = {
  code: z.string().optional().describe("TypeScript or JavaScript source code to analyse."),
  path: z
    .string()
    .optional()
    .describe(
      "Absolute path to a TypeScript or JavaScript file, or a glob pattern " +
        "(e.g. 'src/**/*.ts') to analyse multiple files. " +
        "Ignored when `code` is also provided.",
    ),
  filename: z
    .string()
    .optional()
    .describe(
      "Optional filename for language detection (e.g. 'input.ts'). " +
        "Only used when `code` is provided; ignored for `path`.",
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

async function execute(args: ToolArgs<typeof inputShape>) {
  const topN = args.topN ?? DEFAULT_TOP_N;

  if (!args.code && !args.path) {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: "find_hotspots requires either an inline `code` string or a `path` to a file or glob pattern.",
        },
      ],
    };
  }

  // Resolve input sources via the input adapter.
  // args.path is defined here (early-return above guards !args.code && !args.path)
  const pathArg = args.path as string;
  let resolveSpec: Parameters<typeof resolveInput>[0];
  if (args.code) {
    resolveSpec = args.filename
      ? { code: args.code, filename: args.filename }
      : { code: args.code };
  } else if (isGlobPattern(pathArg)) {
    resolveSpec = { glob: pathArg };
  } else {
    resolveSpec = { path: pathArg };
  }

  const resolved = await resolveInput(resolveSpec, MAX_SOURCE_BYTES);

  if (resolved.kind === "error") {
    return {
      isError: true as const,
      content: [{ type: "text" as const, text: resolved.message }],
    };
  }

  if (resolved.entries.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ hotspots: [], message: "No matching files found." }, null, 2),
        },
      ],
    };
  }

  // Analyse all source entries and collect scored units across all files.
  type ScoredUnit = {
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
    timeComplexity: string;
    spaceComplexity: string;
    confidence: string;
    recursion?: unknown;
    uncertainNodes: unknown[];
    score: number;
    filename?: string;
  };

  const allScored: ScoredUnit[] = [];
  let totalFunctions = 0;
  const multiFile = resolved.entries.length > 1;

  for (const entry of resolved.entries) {
    const parsed = parseCode(entry.source, entry.filename);
    if (!parsed.success) continue;

    totalFunctions += parsed.units.length;

    for (const unit of parsed.units) {
      const r = analyzeUnit(unit);
      const timeSeverity = severityOf(r.timeComplexity);
      const spaceSeverity = severityOf(r.spaceComplexity);
      const confidencePenalty =
        r.confidence === "high" ? 0 : r.confidence === "medium" ? -0.1 : -0.2;
      const score = timeSeverity + spaceSeverity * 0.5 + confidencePenalty;

      allScored.push({
        name: unit.name,
        kind: unit.kind,
        startLine: unit.startLine,
        endLine: unit.endLine,
        timeComplexity: r.timeComplexity,
        spaceComplexity: r.spaceComplexity,
        confidence: r.confidence,
        ...(r.recursion !== undefined ? { recursion: r.recursion } : {}),
        uncertainNodes: r.uncertainNodes,
        score,
        ...(multiFile ? { filename: entry.filename } : {}),
      });
    }
  }

  allScored.sort((a, b) => b.score - a.score || a.startLine - b.startLine);

  const hotspots = allScored.slice(0, topN).map(({ score: _score, ...rest }) => rest);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ hotspots, totalFunctions }, null, 2),
      },
    ],
  };
}

const tool: ToolDefinition<typeof inputShape> = {
  name: "find_hotspots",
  description:
    "Identify the most algorithmically expensive functions in TypeScript or JavaScript code. " +
    "Accepts inline `code`, a `path` to a single file, or a glob pattern (e.g. 'src/**/*.ts') " +
    "for multi-file analysis (code takes precedence when both are given). " +
    "Returns up to topN functions ranked by time complexity severity (worst first) " +
    "with space complexity, confidence, and recursion info. " +
    "For multi-file runs, each result includes the source filename.",
  inputShape,
  execute,
};

export default tool;
