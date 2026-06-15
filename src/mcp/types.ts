import type { z } from "zod";

/** Raw zod shape (not ZodObject) that the McpServer accepts for tool schemas. */
export type ToolInputShape = Record<string, z.ZodTypeAny>;

/** Resolved arg types from a ToolInputShape. */
export type ToolArgs<S extends ToolInputShape> = { [K in keyof S]: z.infer<S[K]> };

export interface ToolCallResult {
  [key: string]: unknown;
  isError?: true;
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Contract each module under src/mcp/tools/ must default-export.
 * The registry auto-discovers these at startup — new tools are files, not list entries.
 */
export interface ToolDefinition<S extends ToolInputShape = ToolInputShape> {
  readonly name: string;
  readonly description: string;
  /** Zod raw shape used for input validation and MCP schema generation. */
  readonly inputShape: S;
  execute(args: ToolArgs<S>): ToolCallResult | Promise<ToolCallResult>;
}
