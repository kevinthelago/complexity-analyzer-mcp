import { describe, expect, it } from "vitest";
import { nodePosition, parseCode } from "../index.js";

describe("parseCode", () => {
  it("parses a named function declaration", () => {
    const result = parseCode("function foo(n: number): number { return n; }");
    expect(result.success).toBe(true);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]?.name).toBe("foo");
    expect(result.units[0]?.kind).toBe("function");
  });

  it("parses an arrow function assigned to a variable", () => {
    const result = parseCode("const bar = (x: number) => x * 2;");
    expect(result.success).toBe(true);
    const arrow = result.units.find((u) => u.name === "bar");
    expect(arrow).toBeDefined();
    expect(arrow?.kind).toBe("arrow");
  });

  it("parses class methods and constructor", () => {
    const src = `
      class Foo {
        constructor(private x: number) {}
        getValue(): number { return this.x; }
      }
    `;
    const result = parseCode(src);
    expect(result.success).toBe(true);
    const names = result.units.map((u) => u.name);
    expect(names).toContain("Foo.constructor");
    expect(names).toContain("Foo.getValue");
  });

  it("returns structured error on completely broken syntax — does not throw", () => {
    const result = parseCode("function (((((");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("units");
    expect(result.parseError === undefined || typeof result.parseError.message === "string").toBe(
      true,
    );
  });

  it("reports line numbers", () => {
    const src = "function first() {}\nfunction second() {}";
    const result = parseCode(src);
    expect(result.success).toBe(true);
    const first = result.units.find((u) => u.name === "first");
    const second = result.units.find((u) => u.name === "second");
    expect(first?.startLine).toBe(1);
    expect(second?.startLine).toBe(2);
  });

  it("sets typeInfoAvailable when TS source compiles", () => {
    const result = parseCode("function add(a: number, b: number): number { return a + b; }");
    expect(result.typeInfoAvailable).toBe(true);
  });
});

describe("nodePosition", () => {
  it("returns 1-based line and col for a node", () => {
    const result = parseCode("function foo() {}");
    const unit = result.units[0];
    expect(unit).toBeDefined();
    if (!unit) return;
    const pos = nodePosition(unit.node);
    expect(pos.line).toBe(1);
    expect(pos.col).toBeGreaterThanOrEqual(1);
  });
});
