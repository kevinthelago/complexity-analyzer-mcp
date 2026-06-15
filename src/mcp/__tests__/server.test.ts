import { describe, expect, it } from "vitest";
import { discoverTools } from "../registry.js";
import { createServer } from "../server.js";

describe("MCP server", () => {
  it("discoverTools returns all four tool definitions", async () => {
    const tools = await discoverTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain("analyze_complexity");
    expect(names).toContain("deep_analyze");
    expect(names).toContain("find_hotspots");
    expect(names).toContain("suggest_optimizations");
    expect(tools.length).toBe(4);
  });

  it("each discovered tool has name, description, inputShape, and execute", async () => {
    const tools = await discoverTools();
    for (const tool of tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputShape).toBe("object");
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("createServer resolves without throwing", async () => {
    await expect(createServer()).resolves.toBeDefined();
  });
});
