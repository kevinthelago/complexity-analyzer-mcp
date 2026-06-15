import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../server.js";

type JsonObj = Record<string, unknown>;

function makeServer() {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: string[] = [];
  const waiters: Array<() => void> = [];

  let pending = "";
  output.on("data", (chunk: Buffer) => {
    pending += chunk.toString();
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      lines.push(trimmed);
      const wake = waiters.shift();
      if (wake !== undefined) wake();
    }
  });

  createMcpServer(input, output);

  return {
    send(msg: unknown): void {
      input.write(`${JSON.stringify(msg)}\n`);
    },
    nextResponse(): Promise<JsonObj> {
      return new Promise<JsonObj>((resolve) => {
        const tryResolve = () => {
          const line = lines.shift();
          if (line !== undefined) {
            resolve(JSON.parse(line) as JsonObj);
          } else {
            waiters.push(tryResolve);
          }
        };
        tryResolve();
      });
    },
  };
}

const INIT_REQUEST = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  },
};

describe("MCP stdio server", () => {
  it("responds to initialize with server info", async () => {
    const s = makeServer();
    s.send(INIT_REQUEST);
    const res = await s.nextResponse();
    expect(res.id).toBe(1);
    const result = res.result as JsonObj;
    expect(result.protocolVersion).toBe("2024-11-05");
    const serverInfo = result.serverInfo as JsonObj;
    expect(serverInfo.name).toBe("complexity-analyzer-mcp");
  });

  it("sends no response for the initialized notification", async () => {
    const s = makeServer();
    s.send(INIT_REQUEST);
    await s.nextResponse(); // consume initialize response

    s.send({ jsonrpc: "2.0", method: "initialized" });
    // Send a ping so we know the server is processing and didn't send a response for initialized
    s.send({ jsonrpc: "2.0", id: 2, method: "ping" });
    const res = await s.nextResponse();
    expect(res.id).toBe(2); // ping response, not initialized response
  });

  it("responds to ping", async () => {
    const s = makeServer();
    s.send({ jsonrpc: "2.0", id: 3, method: "ping" });
    const res = await s.nextResponse();
    expect(res.id).toBe(3);
    expect(res.result).toEqual({});
  });

  it("lists four tools via tools/list", async () => {
    const s = makeServer();
    s.send({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    const res = await s.nextResponse();
    const result = res.result as JsonObj;
    const tools = result.tools as Array<{ name: string }>;
    expect(tools.length).toBe(4);
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain("analyze_complexity");
    expect(names).toContain("suggest_optimizations");
    expect(names).toContain("find_hotspots");
    expect(names).toContain("deep_analyze");
  });

  it("calls analyze_complexity and returns unit data", async () => {
    const s = makeServer();
    s.send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "analyze_complexity",
        arguments: { code: "function add(a: number, b: number): number { return a + b; }" },
      },
    });
    const res = await s.nextResponse();
    expect(res.id).toBe(5);
    const result = res.result as JsonObj;
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ text: string }>;
    const data = JSON.parse(content[0]?.text ?? "{}") as { units: unknown[] };
    expect(data.units.length).toBeGreaterThan(0);
  });

  it("calls find_hotspots and returns units ranked worst-first", async () => {
    const s = makeServer();
    s.send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "find_hotspots",
        arguments: {
          code: `
function linear(arr: number[]): number {
  let sum = 0;
  for (const x of arr) sum += x;
  return sum;
}
function quadratic(arr: number[]): void {
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      console.log(arr[i], arr[j]);
    }
  }
}`,
        },
      },
    });
    const res = await s.nextResponse();
    expect(res.id).toBe(6);
    const result = res.result as JsonObj;
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ text: string }>;
    const data = JSON.parse(content[0]?.text ?? "{}") as {
      units: Array<{ name: string; timeComplexity: string; hotspots: unknown[] }>;
    };
    // Two units; quadratic (O(n²)) must come before linear (O(n)).
    expect(data.units.length).toBe(2);
    expect(data.units[0]?.timeComplexity).toBe("O(n²)");
    expect(data.units[1]?.timeComplexity).toBe("O(n)");
    // quadratic unit should have at least one hotspot
    expect(data.units[0]?.hotspots.length ?? 0).toBeGreaterThan(0);
  });

  it("find_hotspots returns isError when code is missing", async () => {
    const s = makeServer();
    s.send({
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: { name: "find_hotspots", arguments: {} },
    });
    const res = await s.nextResponse();
    const result = res.result as JsonObj;
    expect(result.isError).toBe(true);
  });

  it("find_hotspots returns isError for oversized input", async () => {
    const s = makeServer();
    s.send({
      jsonrpc: "2.0",
      id: 62,
      method: "tools/call",
      params: { name: "find_hotspots", arguments: { code: "x".repeat(300_000) } },
    });
    const res = await s.nextResponse();
    const result = res.result as JsonObj;
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text).toMatch(/limit|exceed/i);
  });

  it("returns METHOD_NOT_FOUND for an unknown tool", async () => {
    const s = makeServer();
    s.send({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "nonexistent_tool", arguments: {} },
    });
    const res = await s.nextResponse();
    const error = res.error as JsonObj;
    expect(error.code).toBe(-32601);
    expect((error.message as string).toLowerCase()).toContain("unknown tool");
  });

  it("returns METHOD_NOT_FOUND for an unknown method", async () => {
    const s = makeServer();
    s.send({ jsonrpc: "2.0", id: 8, method: "nonexistent/method" });
    const res = await s.nextResponse();
    const error = res.error as JsonObj;
    expect(error.code).toBe(-32601);
  });

  it("returns PARSE_ERROR for invalid JSON", async () => {
    const s = makeServer();
    s.send = (_msg: unknown) => {
      // bypass JSON serialization to send raw invalid data
    };
    // Write raw invalid JSON directly
    const input = new PassThrough();
    const output = new PassThrough();
    const responses: string[] = [];
    output.on("data", (chunk: Buffer) => responses.push(chunk.toString()));
    createMcpServer(input, output);
    input.write("not valid json\n");
    await new Promise<void>((r) => setImmediate(r));
    expect(responses.join("")).toContain("-32700");
  });

  it("returns INVALID_REQUEST for a message without method", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const responses: string[] = [];
    output.on("data", (chunk: Buffer) => responses.push(chunk.toString()));
    createMcpServer(input, output);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 9 })}\n`);
    await new Promise<void>((r) => setImmediate(r));
    const res = JSON.parse(responses.join("").trim()) as JsonObj;
    expect((res.error as JsonObj).code).toBe(-32600);
  });
});
