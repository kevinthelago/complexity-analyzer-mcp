/**
 * Golden corpus for the static complexity analyzer.
 * Each entry pins the KB version it was authored against.
 * Expected values reflect what the STATIC ANALYZER produces, not necessarily
 * the true algorithmic complexity (documented where they diverge).
 */

export const KB_VERSION_PINNED = "1.0.0";

export interface CorpusEntry {
  id: string;
  description: string;
  /** Valid TypeScript snippet containing exactly one top-level function. */
  snippet: string;
  /** KB version this entry was authored against. */
  kbVersion: string;
  expected: {
    timeComplexity: string;
    spaceComplexity: string;
    /** When provided, the analyzer's confidence must match exactly. */
    confidence?: "high" | "medium" | "low";
    /**
     * When true, the analyzer must report at least one uncertain node.
     * Use for calls whose cost cannot be determined statically.
     */
    uncertainExpected?: boolean;
    /**
     * When provided, findHotspots must return at least one hotspot
     * whose bigO matches each listed value.
     */
    hotspots?: Array<{ bigO: string }>;
  };
}

export const CORPUS: CorpusEntry[] = [
  // ── Constant time ──────────────────────────────────────────────────────────

  {
    id: "constant-time-arithmetic",
    description: "Pure arithmetic returns O(1) with high confidence",
    kbVersion: KB_VERSION_PINNED,
    snippet: `function add(a: number, b: number): number { return a + b; }`,
    expected: {
      timeComplexity: "O(1)",
      spaceComplexity: "O(1)",
      confidence: "high",
      hotspots: [],
    },
  },

  {
    id: "constant-time-property-access",
    description: "Array index access and length check are O(1)",
    kbVersion: KB_VERSION_PINNED,
    snippet: `function first(arr: number[]): number { return arr[0] ?? 0; }`,
    expected: {
      timeComplexity: "O(1)",
      spaceComplexity: "O(1)",
      confidence: "high",
    },
  },

  // ── Single loops ───────────────────────────────────────────────────────────

  {
    id: "single-for-of-loop",
    description: "A single for-of loop is O(n) time, O(1) space",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function sum(arr: number[]): number {
        let s = 0;
        for (const x of arr) s += x;
        return s;
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      hotspots: [{ bigO: "O(n)" }],
    },
  },

  {
    id: "single-for-loop",
    description: "A classic for(;;) loop is O(n) time",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function sumTo(n: number): number {
        let s = 0;
        for (let i = 0; i < n; i++) s += i;
        return s;
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      hotspots: [{ bigO: "O(n)" }],
    },
  },

  {
    id: "single-while-loop",
    description: "A while loop is O(n) time",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function countdown(n: number): number {
        let count = 0;
        while (n > 0) { n--; count++; }
        return count;
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
  },

  // ── Sequential loops (not nested → still O(n)) ────────────────────────────

  {
    id: "sequential-loops",
    description: "Two sequential (non-nested) loops are O(n) — dominant term, not additive",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function twoPass(arr: number[]): number[] {
        for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] ?? 0) * 2;
        for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] ?? 0) + 1;
        return arr;
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
  },

  // ── Nested loops ───────────────────────────────────────────────────────────

  {
    id: "nested-for-loops-n-squared",
    description: "Two-deep nested for loops produce O(n²) time",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function bubbleSort(arr: number[]): void {
        for (let i = 0; i < arr.length; i++) {
          for (let j = 0; j < arr.length - i - 1; j++) {
            if ((arr[j] ?? 0) > (arr[j + 1] ?? 0)) {
              const tmp = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = tmp;
            }
          }
        }
      }
    `,
    expected: {
      timeComplexity: "O(n²)",
      spaceComplexity: "O(1)",
      confidence: "high",
      hotspots: [{ bigO: "O(n²)" }],
    },
  },

  {
    id: "triple-nested-loops-n-cubed",
    description: "Three-deep nested loops produce O(n³) time",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function matMul(a: number[][], b: number[][], n: number): number[][] {
        const c: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            for (let k = 0; k < n; k++) {
              (c[i] as number[])[j] = ((c[i] as number[])[j] ?? 0) + ((a[i] as number[])[k] ?? 0) * ((b[k] as number[])[j] ?? 0);
            }
          }
        }
        return c;
      }
    `,
    expected: {
      timeComplexity: "O(n³)",
      spaceComplexity: "O(n)",
    },
  },

  // ── Builtin-driven costs ───────────────────────────────────────────────────

  {
    id: "builtin-sort",
    description: "Array.sort() drives O(n log n) time; space is O(log n) because sort's stack cost dominates the spread in the engine's space model",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function sortedCopy(arr: number[]): number[] {
        return [...arr].sort((a, b) => a - b);
      }
    `,
    expected: {
      timeComplexity: "O(n log n)",
      // True space is O(n) for the spread copy, but the engine's estimateAllocationSpace
      // prioritises O(log n) (sort's stack depth) over O(n) (array allocation).
      spaceComplexity: "O(log n)",
      hotspots: [{ bigO: "O(n log n)" }],
    },
  },

  {
    id: "builtin-filter",
    description: "Array.filter() drives O(n) time and O(n) space",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function evens(arr: number[]): number[] {
        return arr.filter(x => x % 2 === 0);
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
  },

  {
    id: "includes-in-loop",
    description: "arr.slice().includes() inside a for loop: engine reports O(n) (takes max of loop + calls, does not multiply). True algorithmic complexity is O(n²).",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function hasDuplicates(arr: number[]): boolean {
        for (let i = 0; i < arr.length; i++) {
          if (arr.slice(0, i).includes(arr[i] ?? 0)) return true;
        }
        return false;
      }
    `,
    expected: {
      // Known static-analysis limitation: the engine takes dominant(loop=O(n), calls=O(n))
      // rather than multiplying O(n) loop × O(n) contained call. Annotated as O(n)
      // to document actual engine output; true complexity is O(n²).
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
  },

  // ── Hash-vs-scan ──────────────────────────────────────────────────────────

  {
    id: "hash-lookup",
    description: "Set.has() lookup inside a loop keeps overall complexity at O(n)",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function unique(arr: number[]): number[] {
        const seen = new Set<number>();
        const out: number[] = [];
        for (const x of arr) {
          if (!seen.has(x)) { seen.add(x); out.push(x); }
        }
        return out;
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
  },

  // ── Multi-variable nested loops ───────────────────────────────────────────

  {
    id: "multi-variable-nested-loops",
    description: "Nested loops over two arrays; static analyzer approximates as O(n²)",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function crossProduct(a: string[], b: string[]): string[] {
        const result: string[] = [];
        for (const x of a) {
          for (const y of b) {
            result.push(\`\${x},\${y}\`);
          }
        }
        return result;
      }
    `,
    expected: {
      // True complexity is O(n·m); single-variable model approximates as O(n²)
      timeComplexity: "O(n²)",
      spaceComplexity: "O(n)",
    },
  },

  // ── Space complexity ───────────────────────────────────────────────────────

  {
    id: "in-place-operation",
    description: "In-place array reversal uses O(1) space",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function reverseInPlace(arr: number[]): void {
        let l = 0; let r = arr.length - 1;
        while (l < r) {
          const tmp = arr[l]; arr[l] = arr[r]; arr[r] = tmp;
          l++; r--;
        }
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
  },

  {
    id: "new-collection-space",
    description: "Mapping to a new array allocates O(n) space",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function doubled(arr: number[]): number[] {
        return arr.map(x => x * 2);
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
  },

  // ── Recursion ─────────────────────────────────────────────────────────────

  {
    id: "recursion-linear",
    description: "Single recursive call with n-1 decrement → O(n) linear recursion",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function factorial(n: number): number {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
      }
    `,
    expected: {
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
      confidence: "medium",
    },
  },

  {
    id: "recursion-divide-and-conquer",
    description: "Two recursive calls with halved input → O(n log n) by Master Theorem",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function mergeSort(arr: number[]): number[] {
        if (arr.length <= 1) return arr;
        const mid = Math.floor(arr.length / 2);
        const left = mergeSort(arr.slice(0, mid));
        const right = mergeSort(arr.slice(mid));
        return [...left, ...right];
      }
    `,
    expected: {
      timeComplexity: "O(n log n)",
      spaceComplexity: "O(log n)",
      confidence: "medium",
    },
  },

  {
    id: "recursion-exponential",
    description: "Two recursive calls without input halving → O(2ⁿ) exponential",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function fib(n: number): number {
        if (n <= 1) return n;
        return fib(n - 1) + fib(n - 2);
      }
    `,
    expected: {
      timeComplexity: "O(2ⁿ)",
      spaceComplexity: "O(2ⁿ)",
      confidence: "medium",
    },
  },

  {
    id: "recursion-memoized",
    description: "Memoized fibonacci: static analyzer still sees two recursive calls → O(2ⁿ). True complexity with memoization is O(n).",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function fibMemo(n: number, memo: Map<number, number> = new Map()): number {
        if (n <= 1) return n;
        if (memo.has(n)) return memo.get(n)!;
        const result = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);
        memo.set(n, result);
        return result;
      }
    `,
    expected: {
      // Static analyzer cannot reason about memoization; reports exponential
      timeComplexity: "O(2ⁿ)",
      spaceComplexity: "O(2ⁿ)",
    },
  },

  // ── Uncertain ─────────────────────────────────────────────────────────────

  {
    id: "uncertain-single-recursive-call",
    description: "Single recursive call with no clear input-reduction pattern → uncertain complexity",
    kbVersion: KB_VERSION_PINNED,
    snippet: `
      function mystery(n: number): number {
        if (n === 0) return 0;
        return mystery(n);
      }
    `,
    expected: {
      timeComplexity: "unknown",
      spaceComplexity: "unknown",
      uncertainExpected: true,
    },
  },
];
