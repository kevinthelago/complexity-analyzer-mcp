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
      description: "Optional filename for language detection. Defaults to 'input.ts'.",
    },
  },
  required: ["code"],
} as const;

// TODO(CA-5): replace with real hotspot detection once the engine-analysis branch lands.
function execute(_args: Record<string, unknown>): McpToolCallResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: "find_hotspots is not yet available — hotspot detection (CA-5) has not landed in this build.",
      },
    ],
  };
}

/** MCP tool stub for find_hotspots — real implementation depends on CA-5 (hotspot analyzer). */
export const findHotspotsTool: McpTool = {
  name: "find_hotspots",
  description:
    "Identify the highest-complexity functions in TypeScript/JavaScript code, ranked by Big-O cost. (Not yet available in this build.)",
  inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
  execute,
};
