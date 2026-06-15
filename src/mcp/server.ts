import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZodError } from "zod";
import { discoverTools } from "./registry.js";
import type { ToolDefinition } from "./types.js";

/** Register a single tool definition with the McpServer. */
function registerTool(server: McpServer, tool: ToolDefinition): void {
  // biome-ignore lint/suspicious/noExplicitAny: McpServer.tool() accepts ZodRawShapeCompat (typed as any); we bridge the type gap here
  const shape = tool.inputShape as any;
  const handler = async (args: unknown): Promise<unknown> => {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: args shape is validated by McpServer before we receive it
      return await tool.execute(args as any);
    } catch (err) {
      const message =
        err instanceof ZodError
          ? err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  };
  // biome-ignore lint/suspicious/noExplicitAny: handler cast required to satisfy McpServer overload union
  server.tool(tool.name, tool.description, shape, handler as any);
}

/**
 * Create and configure the MCP server with all auto-discovered tools.
 * The server holds no cross-call state — each tool call is stateless.
 */
export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: "complexity-analyzer",
    version: "0.1.0",
  });

  const tools = await discoverTools();
  for (const tool of tools) {
    registerTool(server, tool);
  }

  return server;
}

/** Start the MCP stdio server (blocks until stdin is closed). */
export async function startServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
