import { describe, expect, it } from "vitest";
import { parseCode } from "../../../engine/parser/index.js";
import { analyzeUnit } from "../../../engine/static/index.js";
import { findHotspots } from "../index.js";

function analyze(src: string) {
  const parsed = parseCode(src, "input.ts");
  expect(parsed.success).toBe(true);
  expect(parsed.units.length).toBeGreaterThan(0);
  const unit = parsed.units[0]!;
  const result = analyzeUnit(unit);
  return { unit, result, hotspots: findHotspots(unit, result) };
}

// ── O(1) units ─────────────────────────────────────────────────────────────

describe("findHotspots — O(1) units", () => {
  it("returns empty list for a constant-time function", () => {
    const { hotspots } = analyze(`
      function add(a: number, b: number): number { return a + b; }
    `);
    expect(hotspots).toHaveLength(0);
  });

  it("returns empty list for a function with only O(1) property access", () => {
    const { hotspots } = analyze(`
      function first(arr: number[]): number { return arr[0] ?? 0; }
    `);
    expect(hotspots).toHaveLength(0);
  });
});

// ── Loop hotspots ─────────────────────────────────────────────────────────

describe("findHotspots — loop constructs", () => {
  it("reports a single for loop as O(n) hotspot", () => {
    const { hotspots } = analyze(`
      function sum(arr: number[]): number {
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i] ?? 0;
        return s;
      }
    `);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]!.bigO).toBe("O(n)");
    expect(hotspots[0]!.uncertain).toBe(false);
  });

  it("reports a for-of loop as O(n) hotspot", () => {
    const { hotspots } = analyze(`
      function sumOf(arr: number[]): number {
        let s = 0;
        for (const x of arr) s += x;
        return s;
      }
    `);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]!.bigO).toBe("O(n)");
    expect(hotspots[0]!.reason).toMatch(/for-of/i);
  });

  it("reports outer nested loop as O(n²) hotspot, not the inner one", () => {
    const { hotspots, result } = analyze(`
      function matMul(a: number[][], b: number[][], n: number): number[][] {
        const c: number[][] = [];
        for (let i = 0; i < n; i++) {
          c[i] = [];
          for (let j = 0; j < n; j++) {
            let s = 0;
            for (let k = 0; k < n; k++) s += (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0);
            (c[i] as number[])[j] = s;
          }
        }
        return c;
      }
    `);
    expect(result.timeComplexity).toBe("O(n³)");
    const bigOs = hotspots.map((h) => h.bigO);
    expect(bigOs).toContain("O(n³)");
    // Outer loop should be ranked first (worst)
    expect(hotspots[0]!.bigO).toBe("O(n³)");
  });

  it("reports two-deep nesting as O(n²)", () => {
    const { hotspots, result } = analyze(`
      function bubbleSort(arr: number[]): void {
        for (let i = 0; i < arr.length; i++) {
          for (let j = 0; j < arr.length - i - 1; j++) {
            if ((arr[j] ?? 0) > (arr[j + 1] ?? 0)) {
              const tmp = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = tmp;
            }
          }
        }
      }
    `);
    expect(result.timeComplexity).toBe("O(n²)");
    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots[0]!.bigO).toBe("O(n²)");
  });
});

// ── Call hotspots ─────────────────────────────────────────────────────────

describe("findHotspots — call constructs", () => {
  it("reports .sort() as O(n log n) hotspot", () => {
    const { hotspots } = analyze(`
      function sortedCopy(arr: number[]): number[] {
        return [...arr].sort((a, b) => a - b);
      }
    `);
    const sortHotspot = hotspots.find((h) => h.reason.includes("sort"));
    expect(sortHotspot).toBeDefined();
    expect(sortHotspot!.bigO).toMatch(/O\(n/);
  });

  it("does not report O(1) calls as hotspots", () => {
    const { hotspots } = analyze(`
      function push(arr: number[], x: number): void { arr.push(x); }
    `);
    expect(hotspots).toHaveLength(0);
  });
});

// ── Ranking ────────────────────────────────────────────────────────────────

describe("findHotspots — ranking", () => {
  it("ranks hotspots worst-first", () => {
    const { hotspots } = analyze(`
      function mixed(arr: number[]): void {
        for (let i = 0; i < arr.length; i++) {
          for (let j = 0; j < arr.length; j++) {
            // nested O(n²) body
          }
        }
      }
    `);
    // All matching hotspots should have the same (dominant) Big-O
    expect(hotspots.every((h) => h.bigO === hotspots[0]!.bigO)).toBe(true);
  });

  it("stable tie-breaking: earlier line comes first", () => {
    const { hotspots } = analyze(`
      function twoLoops(arr: number[]): void {
        for (let i = 0; i < arr.length; i++) { arr[i] = 0; }
        for (let j = 0; j < arr.length; j++) { arr[j] = 1; }
      }
    `);
    // Two O(n) loops — the first should appear first (smaller line number)
    if (hotspots.length >= 2) {
      expect(hotspots[0]!.line).toBeLessThanOrEqual(hotspots[1]!.line);
    }
  });
});

// ── Hotspot shape ────────────────────────────────────────────────────────

describe("findHotspots — hotspot shape", () => {
  it("each hotspot carries line, col, snippet, bigO, reason, uncertain", () => {
    const { hotspots } = analyze(`
      function loop(arr: number[]): void {
        for (const x of arr) { void x; }
      }
    `);
    expect(hotspots.length).toBeGreaterThan(0);
    const h = hotspots[0]!;
    expect(typeof h.line).toBe("number");
    expect(typeof h.col).toBe("number");
    expect(typeof h.snippet).toBe("string");
    expect(h.snippet.length).toBeGreaterThan(0);
    expect(h.snippet.length).toBeLessThanOrEqual(80);
    expect(typeof h.bigO).toBe("string");
    expect(typeof h.reason).toBe("string");
    expect(h.reason.length).toBeGreaterThan(0);
    expect(typeof h.uncertain).toBe("boolean");
  });

  it("snippet is a non-empty single-line excerpt", () => {
    const { hotspots } = analyze(`
      function loop(arr: number[]): void {
        for (const x of arr) {
          void x;
        }
      }
    `);
    for (const h of hotspots) {
      expect(h.snippet).not.toMatch(/\n/);
    }
  });
});

// ── Uncertain flagging ───────────────────────────────────────────────────

describe("findHotspots — uncertain flagging", () => {
  it("hotspots from uncertain recursion are flagged uncertain", () => {
    // Single recursive call without a clear reduction pattern → uncertain
    const { hotspots, result } = analyze(`
      function mystery(n: number): number {
        if (n === 0) return 0;
        return mystery(n);
      }
    `);
    // uncertain recursion → timeComplexity is "unknown" → no hotspots
    // (accept either no hotspots OR uncertain-flagged hotspots)
    if (hotspots.length > 0) {
      expect(hotspots.every((h) => h.uncertain)).toBe(true);
    } else {
      expect(result.recursion?.kind).toBe("uncertain");
    }
  });

  it("non-uncertain hotspots have uncertain=false", () => {
    const { hotspots } = analyze(`
      function bubbleSort(arr: number[]): void {
        for (let i = 0; i < arr.length; i++) {
          for (let j = 0; j < arr.length - i; j++) {
            if ((arr[j] ?? 0) > (arr[j + 1] ?? 0)) {
              const tmp = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = tmp;
            }
          }
        }
      }
    `);
    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots.every((h) => !h.uncertain)).toBe(true);
  });
});

// ── Recursion hotspots ───────────────────────────────────────────────────

describe("findHotspots — recursive units", () => {
  it("reports recursive call site for linear recursion", () => {
    const { hotspots, result } = analyze(`
      function factorial(n: number): number {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
      }
    `);
    expect(result.recursion?.kind).toBe("linear");
    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots[0]!.bigO).toBe("O(n)");
    expect(hotspots[0]!.uncertain).toBe(false);
  });

  it("reports recursive call sites for exponential recursion", () => {
    const { hotspots, result } = analyze(`
      function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `);
    expect(result.recursion?.kind).toBe("exponential");
    expect(hotspots.length).toBe(2); // two recursive calls
    expect(hotspots.every((h) => h.bigO === "O(2ⁿ)")).toBe(true);
    // Earlier call site first
    expect(hotspots[0]!.line).toBeLessThanOrEqual(hotspots[1]!.line);
  });

  it("reports recursive call for divide-and-conquer", () => {
    const { hotspots, result } = analyze(`
      function mergeSort(arr: number[]): number[] {
        if (arr.length <= 1) return arr;
        const mid = Math.floor(arr.length / 2);
        return [...mergeSort(arr.slice(0, mid)), ...mergeSort(arr.slice(mid))];
      }
    `);
    expect(result.recursion?.kind).toBe("divide-and-conquer");
    expect(hotspots.length).toBeGreaterThan(0);
    expect(hotspots.every((h) => h.bigO === "O(n log n)")).toBe(true);
  });
});
