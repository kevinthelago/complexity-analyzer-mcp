import { z } from "zod";
import { runPipeline } from "../../engine/pipeline/index.js";
import type { McpTool, McpToolCallResult } from "../types.js";

const MAX_SOURCE_BYTES = 256 * 1024; // 256 KB

const inputSchema = z.object({
  code: z.string().optional(),
  filename: z.string().optional(),
});

const INPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    code: {
      type: "string",
      description: "TypeScript or JavaScript source code to analyse for hotspots.",
    },
    filename: {
      type: "string",
      description:
        "Optional filename for language detection (e.g. 'index.ts'). Defaults to 'input.ts'.",
    },
  },
};

const ORDER: Record<string, number> = {
  "O(1)": 1,
  "O(log n)": 2,
  "O(n)": 3,
  "O(n log n)": 4,
  "O(n²)": 5,
  "O(n³)": 6,
  "O(2ⁿ)": 7,
  unknown: 99,
};

function execute(args: Record<string, unknown>): McpToolCallResult {
  let parsed: z.infer<typeof inputSchema>;
  try {
    parsed = inputSchema.parse(args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${msg}` }] };
  }

  if (!parsed.code) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "find_hotspots requires an inline `code` string.",
        },
      ],
    };
  }

  if (Buffer.byteLength(parsed.code, "utf8") > MAX_SOURCE_BYTES) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Input exceeds the ${MAX_SOURCE_BYTES / 1024} KB limit. Split the file into smaller chunks.`,
        },
      ],
    };
  }

  const filename = parsed.filename ?? "input.ts";
  const result = runPipeline(parsed.code, { filename, stages: ["hotspots"] });

  if (result.parseError) {
    return {
      isError: true,
      content: [{ type: "text", text: `Parse error: ${result.parseError}` }],
    };
  }

  // Rank units worst-first by timeComplexity; stable on ties (preserve parse order).
  const ranked = [...result.units].sort((a, b) => {
    const oa = ORDER[a.timeComplexity] ?? 3;
    const ob = ORDER[b.timeComplexity] ?? 3;
    return ob - oa;
  });

  const output = {
    file: filename,
    units: ranked.map((u) => ({
      name: u.name,
      kind: u.kind,
      startLine: u.startLine,
      endLine: u.endLine,
      timeComplexity: u.timeComplexity,
      hotspots: u.hotspots,
    })),
  };

  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
  };
}

/** MCP tool definition for find_hotspots. */
export const findHotspotsTool: McpTool = {
  name: "find_hotspots",
  description:
    "Identify the highest-complexity functions in TypeScript/JavaScript code, ranked worst-first by Big-O cost. Returns each function with its overall time complexity and the specific constructs (nested loops, expensive built-in calls) that drive it.",
  inputSchema: INPUT_JSON_SCHEMA,
  execute,
};
