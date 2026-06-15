import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.js";

export { createServer, startServer } from "./server.js";
export { discoverTools } from "./registry.js";
export type { ToolCallResult, ToolDefinition, ToolInputShape, ToolArgs } from "./types.js";

// Only start the server when run directly as the entry point, not when imported.
const selfPath = resolve(fileURLToPath(import.meta.url));
const argvPath = process.argv[1] !== undefined ? resolve(process.argv[1]) : "";

if (selfPath === argvPath) {
  void startServer();
}
