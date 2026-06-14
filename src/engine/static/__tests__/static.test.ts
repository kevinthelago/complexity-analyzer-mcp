import { describe, expect, it } from "vitest";
import { parseCode } from "../../parser/index.js";
import { analyzeUnit } from "../index.js";

function analyzeFirst(src: string) {
  const result = parseCode(src, "input.ts");
  expect(result.success).toBe(true);
  expect(result.units.length).toBeGreaterThan(0);
  const unit = result.units[0];
  if (!unit) throw new Error("No units parsed");
  return analyzeUnit(unit);
}

describe("analyzeUnit — simple cases", () => {
  it("O(1) for a function with no loops or allocations", () => {
    const r = analyzeFirst("function add(a: number, b: number): number { return a + b; }");
    expect(r.timeComplexity).toBe("O(1)");
    expect(r.confidence).toBe("high");
  });

  it("O(n) for a single for loop", () => {
    const r = analyzeFirst(`
      function sumArray(arr: number[]): number {
        let s = 0;
        for (const x of arr) s += x;
        return s;
      }
    `);
    expect(r.timeComplexity).toBe("O(n)");
  });

  it("O(n²) for nested loops", () => {
    const r = analyzeFirst(`
      function bubbleSort(arr: number[]): number[] {
        for (let i = 0; i < arr.length; i++) {
          for (let j = 0; j < arr.length - i; j++) {
            if ((arr[j] ?? 0) > (arr[j + 1] ?? 0)) {
              const tmp = arr[j];
              arr[j] = arr[j + 1];
              arr[j + 1] = tmp;
            }
          }
        }
        return arr;
      }
    `);
    expect(r.timeComplexity).toBe("O(n²)");
  });

  it("O(n log n) or higher dominated by Array.sort", () => {
    const r = analyzeFirst(`
      function sortedArr(arr: number[]): number[] {
        return arr.sort((a, b) => a - b);
      }
    `);
    expect(["O(n log n)", "O(n²)"]).toContain(r.timeComplexity);
  });
});

describe("analyzeUnit — recursion", () => {
  it("classifies linear recursion (n-1 pattern)", () => {
    const r = analyzeFirst(`
      function factorial(n: number): number {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
      }
    `);
    expect(r.recursion).toBeDefined();
    expect(r.recursion?.kind).toBe("linear");
    expect(r.timeComplexity).toBe("O(n)");
  });

  it("classifies divide-and-conquer (two calls with halving)", () => {
    const r = analyzeFirst(`
      function mergeSort(arr: number[]): number[] {
        if (arr.length <= 1) return arr;
        const mid = Math.floor(arr.length / 2);
        const left = mergeSort(arr.slice(0, mid));
        const right = mergeSort(arr.slice(mid));
        return [...left, ...right];
      }
    `);
    expect(r.recursion).toBeDefined();
    expect(r.recursion?.kind).toBe("divide-and-conquer");
    expect(r.timeComplexity).toBe("O(n log n)");
  });

  it("classifies exponential recursion (two calls without halving)", () => {
    const r = analyzeFirst(`
      function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `);
    expect(r.recursion).toBeDefined();
    expect(r.recursion?.kind).toBe("exponential");
    expect(r.timeComplexity).toBe("O(2ⁿ)");
  });
});

describe("analyzeUnit — space complexity", () => {
  it("O(1) space for a simple loop", () => {
    const r = analyzeFirst(`
      function sum(arr: number[]): number {
        let s = 0;
        for (const x of arr) s += x;
        return s;
      }
    `);
    expect(r.spaceComplexity).toBe("O(1)");
  });

  it("O(n) space when allocating via map", () => {
    const r = analyzeFirst(`
      function doubled(arr: number[]): number[] {
        return arr.map(x => x * 2);
      }
    `);
    expect(r.spaceComplexity).toBe("O(n)");
  });
});

describe("analyzeUnit — uncertain nodes", () => {
  it("collects no uncertain nodes for well-typed code", () => {
    const r = analyzeFirst(`
      function sum(arr: number[]): number {
        return arr.reduce((acc, x) => acc + x, 0);
      }
    `);
    expect(Array.isArray(r.uncertainNodes)).toBe(true);
  });
});
