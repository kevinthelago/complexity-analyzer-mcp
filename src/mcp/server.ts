import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { getToolByName, listTools } from "./registry.js";
import type { JsonRpcErrorResponse, JsonRpcRequest, JsonRpcSuccessResponse } from "./types.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "complexity-analyzer-mcp";
const SERVER_VERSION = "0.1.0";

// Standard JSON-RPC 2.0 error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function ok<T>(id: string | number | null, result: T): JsonRpcSuccessResponse<T> {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string): JsonRpcErrorResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(
  req: JsonRpcRequest,
): Promise<JsonRpcSuccessResponse | JsonRpcErrorResponse | null> {
  const id = req.id;
  const params = req.params;

  switch (req.method) {
    case "initialize": {
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    }

    case "initialized":
    case "notifications/initialized":
    case "notifications/cancelled": {
      return null; // notifications — no response
    }

    case "ping": {
      return ok(id, {});
    }

    case "tools/list": {
      const tools = listTools().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return ok(id, { tools });
    }

    case "tools/call": {
      const p =
        typeof params === "object" && params !== null
          ? (params as Record<string, unknown>)
          : undefined;

      if (p === undefined) {
        return rpcError(id, INVALID_PARAMS, "Missing params");
      }

      const nameVal = p.name;
      if (typeof nameVal !== "string") {
        return rpcError(id, INVALID_PARAMS, "Missing required field: name");
      }

      const tool = getToolByName(nameVal);
      if (!tool) {
        return rpcError(id, METHOD_NOT_FOUND, `Unknown tool: ${nameVal}`);
      }

      const rawArgs = p.arguments;
      const toolArgs: Record<string, unknown> =
        typeof rawArgs === "object" && rawArgs !== null ? (rawArgs as Record<string, unknown>) : {};

      try {
        const result = await tool.execute(toolArgs);
        return ok(id, result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return rpcError(id, INTERNAL_ERROR, `Tool execution failed: ${msg}`);
      }
    }

    default: {
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
    }
  }
}

/** Create an MCP stdio server on the given streams. Exported for testing. */
export function createMcpServer(input: Readable, output: Writable): void {
  const rl = createInterface({ input, terminal: false });

  rl.on("line", (line: string) => {
    void (async () => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        const response = rpcError(null, PARSE_ERROR, "Parse error: invalid JSON");
        output.write(`${JSON.stringify(response)}\n`);
        return;
      }

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as Record<string, unknown>).jsonrpc !== "2.0" ||
        typeof (parsed as Record<string, unknown>).method !== "string"
      ) {
        const rawId = (parsed as Record<string, unknown> | null)?.id;
        const id = typeof rawId === "string" || typeof rawId === "number" ? rawId : null;
        const response = rpcError(id, INVALID_REQUEST, "Invalid Request");
        output.write(`${JSON.stringify(response)}\n`);
        return;
      }

      const req = parsed as JsonRpcRequest;
      const response = await handleMessage(req);
      if (response !== null) {
        output.write(`${JSON.stringify(response)}\n`);
      }
    })();
  });
}

/** Start the MCP stdio server on process.stdin / process.stdout. */
export function startMcpServer(): void {
  createMcpServer(process.stdin, process.stdout);
  process.stdin.on("close", () => process.exit(0));
}
