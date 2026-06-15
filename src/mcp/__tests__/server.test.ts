import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../server.js";

async function makeClient() {
  const server = await createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0" }, { capabilities: {} });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

let ctx: Awaited<ReturnType<typeof makeClient>>;

beforeEach(async () => {
  ctx = await makeClient();
});

afterEach(async () => {
  await ctx.client.close();
});

describe("MCP server — tool discovery", () => {
  it("lists all four registered tools", async () => {
    const { tools } = await ctx.client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain("analyze_complexity");
    expect(names).toContain("find_hotspots");
    expect(names).toContain("suggest_optimizations");
    expect(names).toContain("deep_analyze");
    expect(tools.length).toBe(4);
  });

  it("each tool has a description and inputSchema", async () => {
    const { tools } = await ctx.client.listTools();
    for (const tool of tools) {
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
    }
  });
});

describe("analyze_complexity tool", () => {
  it("returns unit data for a simple function", async () => {
    const result = await ctx.client.callTool({
      name: "analyze_complexity",
      arguments: { code: "function add(a: number, b: number): number { return a + b; }" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? "{}") as { units: unknown[] };
    expect(data.units.length).toBeGreaterThan(0);
  });

  it("returns an empty units array for code with no functions", async () => {
    const result = await ctx.client.callTool({
      name: "analyze_complexity",
      arguments: { code: "const x = 42;" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? "{}") as { units: unknown[] };
    expect(data.units).toHaveLength(0);
  });

  it("rejects input that exceeds 256 KB", async () => {
    const bigCode = `function f() { return "${"x".repeat(257 * 1024)}"; }`;
    const result = await ctx.client.callTool({
      name: "analyze_complexity",
      arguments: { code: bigCode },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/limit/i);
  });
});

describe("find_hotspots tool", () => {
  it("returns hotspot data ranked by complexity", async () => {
    const code = `
      function linear(arr: number[]) { for (const x of arr) {} }
      function quadratic(arr: number[]) {
        let s = 0;
        for (let i = 0; i < arr.length; i++)
          for (let j = 0; j < arr.length; j++) s += arr[i]! * arr[j]!;
        return s;
      }
    `;
    const result = await ctx.client.callTool({
      name: "find_hotspots",
      arguments: { code, topN: 2 },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? "{}") as {
      hotspots: Array<{ name: string; timeComplexity: string }>;
      totalFunctions: number;
    };
    expect(data.hotspots.length).toBeLessThanOrEqual(2);
    expect(data.totalFunctions).toBe(2);
    // quadratic should rank first
    expect(data.hotspots[0]?.name).toBe("quadratic");
  });

  it("returns empty hotspots for code with no functions", async () => {
    const result = await ctx.client.callTool({
      name: "find_hotspots",
      arguments: { code: "const x = 1;" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? "{}") as { hotspots: unknown[] };
    expect(data.hotspots).toHaveLength(0);
  });

  it("rejects invalid topN", async () => {
    const result = await ctx.client.callTool({
      name: "find_hotspots",
      arguments: { code: "function f() {}", topN: 0 },
    });
    expect(result.isError).toBe(true);
  });
});

describe("suggest_optimizations tool", () => {
  it("returns suggestions array", async () => {
    const result = await ctx.client.callTool({
      name: "suggest_optimizations",
      arguments: { code: "function f(arr: number[]) { for(let i=0;i<arr.length;i++) {} }" },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0]?.text ?? "{}") as {
      suggestions: unknown[];
      summary: string;
    };
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(typeof data.summary).toBe("string");
  });
});

describe("unknown tool", () => {
  it("returns isError for a non-existent tool", async () => {
    const result = await ctx.client.callTool({ name: "nonexistent_tool", arguments: {} });
    // SDK returns a result with isError rather than throwing for unknown tool names
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toMatch(/not found|nonexistent_tool/i);
  });
});
