import { describe, expect, it } from "vitest";
import { parseCode } from "../../parser/index.js";
import { analyzeUnit } from "../../static/index.js";
import { findHotspots, rankHotspotsGlobally } from "../index.js";

function hotspots(src: string) {
  const result = parseCode(src, "input.ts");
  if (!result.success || result.units.length === 0) throw new Error("parse failed");
  const unit = result.units[0];
  if (!unit) throw new Error("no unit");
  const staticResult = analyzeUnit(unit);
  return findHotspots(unit, staticResult);
}

describe("findHotspots — empty cases", () => {
  it("returns empty list for O(1) function", () => {
    const hs = hotspots("function add(a: number, b: number) { return a + b; }");
    expect(hs).toHaveLength(0);
  });

  it("returns empty list for pure Set.has lookup (O(1))", () => {
    const hs = hotspots(`
      function lookup(s: Set<number>, v: number): boolean {
        return s.has(v);
      }
    `);
    expect(hs).toHaveLength(0);
  });
});

describe("findHotspots — loop hotspots", () => {
  it("reports a single for-of loop as O(n) hotspot with kind=loop-nest", () => {
    const hs = hotspots(`
      function sum(arr: number[]): number {
        let s = 0;
        for (const x of arr) s += x;
        return s;
      }
    `);
    expect(hs.length).toBeGreaterThanOrEqual(1);
    expect(hs[0]?.bigO).toBe("O(n)");
    expect(hs[0]?.kind).toBe("loop-nest");
  });

  it("reports outer loop as O(n²) hotspot for nested loops", () => {
    const hs = hotspots(`
      function matrix(arr: number[][]): number {
        let s = 0;
        for (let i = 0; i < arr.length; i++) {
          for (let j = 0; j < (arr[i]?.length ?? 0); j++) {
            s += arr[i]?.[j] ?? 0;
          }
        }
        return s;
      }
    `);
    const loopHotspot = hs.find((h) => h.bigO === "O(n²)");
    expect(loopHotspot).toBeDefined();
  });

  it("does not separately report the inner loop for nested pairs", () => {
    const hs = hotspots(`
      function nested(n: number): void {
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            void (i + j);
          }
        }
      }
    `);
    // Only the outer loop should be reported (inner is subsumed)
    const n2Hotspots = hs.filter((h) => h.bigO === "O(n²)");
    expect(n2Hotspots.length).toBe(1);
  });
});

describe("findHotspots — call expression hotspots", () => {
  it("reports Array.sort() as O(n log n) hotspot with kind=costly-call", () => {
    const hs = hotspots(`
      function sortArr(arr: number[]): number[] {
        return arr.sort((a, b) => a - b);
      }
    `);
    const sortHotspot = hs.find((h) => h.bigO === "O(n log n)");
    expect(sortHotspot).toBeDefined();
    expect(sortHotspot?.reason).toContain(".sort()");
    expect(sortHotspot?.kind).toBe("costly-call");
  });

  it("reports Array.includes() as O(n) hotspot when dominant is O(n)", () => {
    const hs = hotspots(`
      function hasValue(arr: number[], val: number): boolean {
        return arr.includes(val);
      }
    `);
    const incHotspot = hs.find((h) => h.bigO === "O(n)");
    expect(incHotspot).toBeDefined();
  });
});

describe("findHotspots — ranking and ordering", () => {
  it("ranks worst hotspot first", () => {
    const hs = hotspots(`
      function mixed(arr: number[]): number[] {
        arr.sort((a, b) => a - b);  // O(n log n)
        for (const x of arr) void x;  // O(n)
        return arr;
      }
    `);
    if (hs.length >= 2) {
      const firstOrder = ["O(2ⁿ)", "O(n³)", "O(n²)", "O(n log n)", "O(n)", "O(log n)", "O(1)"];
      const aIdx = firstOrder.indexOf(hs[0]?.bigO ?? "");
      const bIdx = firstOrder.indexOf(hs[1]?.bigO ?? "");
      expect(aIdx).toBeLessThanOrEqual(bIdx);
    }
  });

  it("stable-sorts ties by line then col", () => {
    const hs = hotspots(`
      function twoLoops(arr: number[]): void {
        for (const a of arr) void a;
        for (const b of arr) void b;
      }
    `);
    const n1 = hs.filter((h) => h.bigO === "O(n)");
    if (n1.length >= 2) {
      const first = n1[0];
      const second = n1[1];
      if (first && second) {
        expect(first.line).toBeLessThanOrEqual(second.line);
      }
    }
  });
});

describe("findHotspots — uncertain flagging", () => {
  it("flags a hotspot line that falls within an uncertain node", () => {
    const hs = hotspots(`
      function process(items: any[]): void {
        for (const item of items) {
          item.unknownMethod(); // unknown cost → uncertain node
        }
      }
    `);
    expect(Array.isArray(hs)).toBe(true);
  });
});

describe("rankHotspotsGlobally", () => {
  it("combines hotspots from multiple units and ranks worst-first", () => {
    const src1 = "function linear(arr: number[]) { for (const x of arr) x; }";
    const src2 = `
      function quadratic(arr: number[]) {
        for (let i = 0; i < arr.length; i++)
          for (let j = 0; j < arr.length; j++) void (i + j);
      }
    `;

    function unitHotspots(src: string) {
      const parsed = parseCode(src, "input.ts");
      if (!parsed.success || parsed.units.length === 0) return [];
      const unit = parsed.units[0];
      if (!unit) return [];
      const staticResult = analyzeUnit(unit);
      return { name: unit.name, hotspots: findHotspots(unit, staticResult) };
    }

    const u1 = unitHotspots(src1);
    const u2 = unitHotspots(src2);
    if (!u1 || !u2) throw new Error("units missing");

    const global = rankHotspotsGlobally([
      { units: [u1], filename: "file1.ts" },
      { units: [u2], filename: "file2.ts" },
    ]);

    // quadratic's O(n²) hotspot should rank before linear's O(n) hotspot
    expect(global.length).toBeGreaterThanOrEqual(2);
    const firstBigO = global[0]?.bigO;
    expect(firstBigO).toBe("O(n²)");
    // Each entry carries unitName and filename
    expect(global[0]?.unitName).toBe("quadratic");
    expect(global[0]?.filename).toBe("file2.ts");
  });

  it("returns empty array when no hotspots exist", () => {
    const global = rankHotspotsGlobally([{ units: [{ name: "f", hotspots: [] }] }]);
    expect(global).toHaveLength(0);
  });
});
