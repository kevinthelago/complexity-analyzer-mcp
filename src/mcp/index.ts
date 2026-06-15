import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startMcpServer } from "./server.js";

export { createMcpServer, startMcpServer } from "./server.js";
export { getToolByName, listTools } from "./registry.js";
export type { McpContentBlock, McpTool, McpToolCallResult } from "./types.js";

// Only start the server when run directly as the entry point, not when imported.
const selfPath = resolve(fileURLToPath(import.meta.url));
const argvPath = process.argv[1] !== undefined ? resolve(process.argv[1]) : "";

if (selfPath === argvPath) {
  startMcpServer();
}
