import { analyzeComplexityTool } from "./tools/analyze-complexity.js";
import { deepAnalyzeTool } from "./tools/deep-analyze.js";
import { findHotspotsTool } from "./tools/find-hotspots.js";
import { suggestOptimizationsTool } from "./tools/suggest-optimizations.js";
import type { McpTool } from "./types.js";

const TOOLS: McpTool[] = [
  analyzeComplexityTool,
  suggestOptimizationsTool,
  findHotspotsTool,
  deepAnalyzeTool,
];

export function listTools(): McpTool[] {
  return TOOLS;
}

export function getToolByName(name: string): McpTool | undefined {
  return TOOLS.find((t) => t.name === name);
}
