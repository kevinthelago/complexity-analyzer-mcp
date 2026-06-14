import { describe, expect, it } from "vitest";
import { parseCode } from "../../parser/index.js";
import { analyzeUnit } from "../../static/index.js";
import { suggestOptimizations } from "../index.js";
import type { PatternKind } from "../types.js";

function suggestFirst(src: string) {
  const result = parseCode(src, "input.ts");
  expect(result.success).toBe(true);
  expect(result.units.length).toBeGreaterThan(0);
  const unit = result.units[0];
  if (!unit) throw new Error("No units parsed");
  const staticResult = analyzeUnit(unit);
  return suggestOptimizations(unit, staticResult);
}

function hasPattern(src: string, pattern: PatternKind): boolean {
  return suggestFirst(src).suggestions.some((s) => s.pattern === pattern);
}

// ── membership-in-loop ────────────────────────────────────────────────────────

describe("membership-in-loop", () => {
  it("flags Array.includes() inside a for-of loop", () => {
    const result = suggestFirst(`
      function findCommon(arr: string[], targets: string[]): string[] {
        const out: string[] = [];
        for (const x of arr) {
          if (targets.includes(x)) out.push(x);
        }
        return out;
      }
    `);
    const s = result.suggestions.find((s) => s.pattern === "membership-in-loop");
    expect(s).toBeDefined();
    expect(s?.currentComplexity).toBe("O(n²)");
    expect(s?.projectedComplexity).toBe("O(n)");
  });

  it("flags Array.indexOf() inside a for loop", () => {
    expect(
      hasPattern(
        `
        function findIdx(arr: number[], items: number[]): number[] {
          const out: number[] = [];
          for (let i = 0; i < items.length; i++) {
            if (arr.indexOf(items[i] ?? 0) !== -1) out.push(i);
          }
          return out;
        }
      `,
        "membership-in-loop",
      ),
    ).toBe(true);
  });

  it("flags Array.find() inside a while loop", () => {
    expect(
      hasPattern(
        `
        function findItem(arr: string[], targets: string[]): string | undefined {
          let i = 0;
          while (i < targets.length) {
            const found = arr.find(x => x === targets[i]);
            if (found) return found;
            i++;
          }
        }
      `,
        "membership-in-loop",
      ),
    ).toBe(true);
  });

  it("does NOT flag Set.has() inside a loop (already O(1))", () => {
    expect(
      hasPattern(
        `
        function filterKnown(items: string[], known: Set<string>): string[] {
          const out: string[] = [];
          for (const x of items) {
            if (known.has(x)) out.push(x);
          }
          return out;
        }
      `,
        "membership-in-loop",
      ),
    ).toBe(false);
  });

  it("does NOT flag includes() outside any loop", () => {
    expect(
      hasPattern(
        `
        function isPresent(arr: string[], val: string): boolean {
          return arr.includes(val);
        }
      `,
        "membership-in-loop",
      ),
    ).toBe(false);
  });

  it("reports at most one suggestion per loop even with multiple membership calls", () => {
    const result = suggestFirst(`
      function multiCheck(arr: string[], a: string[], b: string[]): string[] {
        const out: string[] = [];
        for (const x of arr) {
          if (a.includes(x) && b.indexOf(x) === -1) out.push(x);
        }
        return out;
      }
    `);
    const count = result.suggestions.filter((s) => s.pattern === "membership-in-loop").length;
    expect(count).toBe(1);
  });
});

// ── sort-in-loop ──────────────────────────────────────────────────────────────

describe("sort-in-loop", () => {
  it("flags Array.sort() inside a for loop", () => {
    const result = suggestFirst(`
      function processRounds(rounds: number[][], k: number): number[][] {
        const results: number[][] = [];
        for (let i = 0; i < k; i++) {
          results.push(rounds.sort((a, b) => a.length - b.length));
        }
        return results;
      }
    `);
    const s = result.suggestions.find((s) => s.pattern === "sort-in-loop");
    expect(s).toBeDefined();
    expect(s?.currentComplexity).toBe("O(n² log n)");
    expect(s?.projectedComplexity).toBe("O(n log n)");
  });

  it("does NOT flag sort() outside a loop", () => {
    expect(
      hasPattern(
        `
        function sorted(arr: number[]): number[] {
          return arr.sort((a, b) => a - b);
        }
      `,
        "sort-in-loop",
      ),
    ).toBe(false);
  });
});

// ── unshift-splice-in-loop ────────────────────────────────────────────────────

describe("unshift-splice-in-loop", () => {
  it("flags Array.unshift() inside a for-of loop", () => {
    const result = suggestFirst(`
      function reversed(items: number[]): number[] {
        const out: number[] = [];
        for (const item of items) {
          out.unshift(item);
        }
        return out;
      }
    `);
    const s = result.suggestions.find((s) => s.pattern === "unshift-splice-in-loop");
    expect(s).toBeDefined();
    expect(s?.currentComplexity).toBe("O(n²)");
    expect(s?.projectedComplexity).toBe("O(n)");
  });

  it("flags Array.splice() inside a while loop", () => {
    expect(
      hasPattern(
        `
        function insertAtFront(arr: number[], vals: number[]): number[] {
          let i = 0;
          while (i < vals.length) {
            arr.splice(0, 0, vals[i] ?? 0);
            i++;
          }
          return arr;
        }
      `,
        "unshift-splice-in-loop",
      ),
    ).toBe(true);
  });

  it("does NOT flag push() inside a loop", () => {
    expect(
      hasPattern(
        `
        function collected(arr: number[]): number[] {
          const out: number[] = [];
          for (const x of arr) out.push(x * 2);
          return out;
        }
      `,
        "unshift-splice-in-loop",
      ),
    ).toBe(false);
  });
});

// ── recompute-in-recursion ────────────────────────────────────────────────────

describe("recompute-in-recursion", () => {
  it("flags exponential recursion (fibonacci) without memoization", () => {
    const result = suggestFirst(`
      function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `);
    const s = result.suggestions.find((s) => s.pattern === "recompute-in-recursion");
    expect(s).toBeDefined();
    expect(s?.currentComplexity).toBe("O(2ⁿ)");
    expect(s?.projectedComplexity).toBe("O(n)");
  });

  it("does NOT flag linear recursion (factorial)", () => {
    expect(
      hasPattern(
        `
        function factorial(n: number): number {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        }
      `,
        "recompute-in-recursion",
      ),
    ).toBe(false);
  });

  it("does NOT flag divide-and-conquer recursion (mergeSort)", () => {
    expect(
      hasPattern(
        `
        function mergeSort(arr: number[]): number[] {
          if (arr.length <= 1) return arr;
          const mid = Math.floor(arr.length / 2);
          const left = mergeSort(arr.slice(0, mid));
          const right = mergeSort(arr.slice(mid));
          return [...left, ...right];
        }
      `,
        "recompute-in-recursion",
      ),
    ).toBe(false);
  });

  it("does NOT flag fibonacci with an inline Map-based memo cache", () => {
    expect(
      hasPattern(
        `
        function fibMemo(n: number, cache = new Map<number, number>()): number {
          if (cache.has(n)) return cache.get(n) as number;
          if (n <= 1) return n;
          const result = fibMemo(n - 1, cache) + fibMemo(n - 2, cache);
          cache.set(n, result);
          return result;
        }
      `,
        "recompute-in-recursion",
      ),
    ).toBe(false);
  });

  it("does NOT flag fibonacci using an external Map memo", () => {
    // The Map.has / Map.get usage inside the function is detectable even though
    // the Map itself is declared outside.
    expect(
      hasPattern(
        `
        const memo = new Map<number, number>();
        function fib(n: number): number {
          if (memo.has(n)) return memo.get(n) as number;
          if (n <= 1) return n;
          const r = fib(n - 1) + fib(n - 2);
          memo.set(n, r);
          return r;
        }
      `,
        "recompute-in-recursion",
      ),
    ).toBe(false);
  });
});

// ── nested-scan ───────────────────────────────────────────────────────────────

describe("nested-scan", () => {
  it("flags two nested for-of loops without hash lookups", () => {
    const result = suggestFirst(`
      function intersection(a: number[], b: number[]): number[] {
        const out: number[] = [];
        for (const x of a) {
          for (const y of b) {
            if (x === y) out.push(x);
          }
        }
        return out;
      }
    `);
    const s = result.suggestions.find((s) => s.pattern === "nested-scan");
    expect(s).toBeDefined();
    expect(s?.currentComplexity).toBe("O(n²)");
    expect(s?.projectedComplexity).toBe("O(n)");
  });

  it("does NOT flag nested loops that already use Set.has()", () => {
    expect(
      hasPattern(
        `
        function intersect(a: number[], b: number[]): number[] {
          const bSet = new Set(b);
          const out: number[] = [];
          for (const x of a) {
            if (bSet.has(x)) out.push(x);
          }
          return out;
        }
      `,
        "nested-scan",
      ),
    ).toBe(false);
  });

  it("does NOT flag a single (non-nested) loop", () => {
    expect(
      hasPattern(
        `
        function sumAll(arr: number[]): number {
          let s = 0;
          for (const x of arr) s += x;
          return s;
        }
      `,
        "nested-scan",
      ),
    ).toBe(false);
  });

  it("does NOT double-report when membership-in-loop already covers the inner loop", () => {
    // The outer loop has an inner loop that uses .includes — membership-in-loop fires
    // on the inner loop; nested-scan should NOT also fire on the outer loop.
    const result = suggestFirst(`
      function check(outer: string[], inner: string[], targets: string[]): string[] {
        const out: string[] = [];
        for (const x of outer) {
          for (const y of inner) {
            if (targets.includes(y)) out.push(x + y);
          }
        }
        return out;
      }
    `);
    const membershipCount = result.suggestions.filter(
      (s) => s.pattern === "membership-in-loop",
    ).length;
    const nestedCount = result.suggestions.filter((s) => s.pattern === "nested-scan").length;
    // membership-in-loop must fire (inner loop has .includes)
    expect(membershipCount).toBeGreaterThan(0);
    // nested-scan should not add a second, redundant suggestion for the same problem
    expect(nestedCount).toBe(0);
  });
});

// ── general contract ──────────────────────────────────────────────────────────

describe("SuggestionResult contract", () => {
  it("returns 'no improvement found' for an already-optimal function", () => {
    const result = suggestFirst(`
      function sum(arr: number[]): number {
        return arr.reduce((acc, x) => acc + x, 0);
      }
    `);
    expect(result.suggestions).toHaveLength(0);
    expect(result.summary).toBe("no improvement found");
  });

  it("returns a non-empty summary when suggestions are present", () => {
    const result = suggestFirst(`
      function slow(arr: string[], targets: string[]): string[] {
        const out: string[] = [];
        for (const x of arr) {
          if (targets.includes(x)) out.push(x);
        }
        return out;
      }
    `);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/Found \d+ optimization/);
  });

  it("orders suggestions by projected impact (highest gain first)", () => {
    // Fibonacci has recompute-in-recursion (O(2ⁿ) → O(n)) — highest priority
    // If other patterns are also present they must come after
    const result = suggestFirst(`
      function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `);
    if (result.suggestions.length > 1) {
      expect(result.suggestions[0]?.pattern).toBe("recompute-in-recursion");
    }
  });

  it("each suggestion has all required fields", () => {
    const result = suggestFirst(`
      function findMatch(arr: string[], targets: string[]): string | undefined {
        for (const x of arr) {
          if (targets.includes(x)) return x;
        }
      }
    `);
    for (const s of result.suggestions) {
      expect(typeof s.pattern).toBe("string");
      expect(typeof s.description).toBe("string");
      expect(typeof s.rationale).toBe("string");
      expect(typeof s.currentComplexity).toBe("string");
      expect(typeof s.projectedComplexity).toBe("string");
      expect(typeof s.location.startLine).toBe("number");
      expect(typeof s.location.endLine).toBe("number");
    }
  });
});
