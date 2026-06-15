import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { discoverTools } from "./registry.js";
import type { ToolDefinition } from "./types.js";

/** Register a single tool definition with the McpServer. */
function registerTool(server: McpServer, tool: ToolDefinition): void {
  // biome-ignore lint/suspicious/noExplicitAny: McpServer.tool() accepts ZodRawShape typed as any; bridging that type gap here
  const shape = tool.inputShape as any;
  // biome-ignore lint/suspicious/noExplicitAny: args shape is validated by McpServer before we receive it
  const handler = async (args: any) => {
    return await tool.execute(args);
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
