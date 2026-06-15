import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ToolDefinition } from "./types.js";

function isToolDefinition(v: unknown): v is ToolDefinition {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === "string" &&
    typeof r.description === "string" &&
    typeof r.inputShape === "object" &&
    r.inputShape !== null &&
    typeof r.execute === "function"
  );
}

/**
 * Scan src/mcp/tools/ (or dist/mcp/tools/ when built) and import every module
 * whose default export satisfies ToolDefinition. Tools are discovered in filename
 * order; no shared list to edit when adding a new tool file.
 */
export async function discoverTools(): Promise<ToolDefinition[]> {
  const toolsDir = join(dirname(fileURLToPath(import.meta.url)), "tools");

  let entries: string[];
  try {
    entries = readdirSync(toolsDir);
  } catch {
    return [];
  }

  const toolFiles = entries
    .filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".ts")) && !f.includes(".test.") && !f.includes(".spec."),
    )
    .sort();

  const tools: ToolDefinition[] = [];
  for (const file of toolFiles) {
    const url = pathToFileURL(join(toolsDir, file)).href;
    try {
      const mod = (await import(url)) as { default?: unknown };
      if (isToolDefinition(mod.default)) {
        tools.push(mod.default);
      }
    } catch {
      // Skip modules that fail to load rather than crashing the server.
    }
  }

  return tools;
}
