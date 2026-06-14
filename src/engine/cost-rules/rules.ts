import type { CostRule } from "./types.js";

export const KB_VERSION = "1.0.0" as const;

export const COST_RULES: readonly CostRule[] = [
  // ── Array ──────────────────────────────────────────────────────────────────
  {
    name: "push",
    receiverType: "Array",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Amortized append to dynamic array.",
    },
  },
  {
    name: "pop",
    receiverType: "Array",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Remove last element; no shift needed.",
    },
  },
  {
    name: "unshift",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "All existing elements must shift right.",
    },
  },
  {
    name: "shift",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "All remaining elements must shift left.",
    },
  },
  {
    name: "splice",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(k)",
      scalesIn: ["n", "k"],
      rationale: "Shift elements after insertion/removal point; k = removed count.",
    },
  },
  {
    name: "slice",
    receiverType: "Array",
    complexity: {
      time: "O(k)",
      space: "O(k)",
      scalesIn: ["k"],
      rationale: "Copy k elements to new array.",
    },
  },
  {
    name: "concat",
    receiverType: "Array",
    complexity: {
      time: "O(n+m)",
      space: "O(n+m)",
      scalesIn: ["n", "m"],
      rationale: "Copies all elements from both arrays.",
    },
  },
  {
    name: "map",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Visits every element; creates new array of same length.",
    },
  },
  {
    name: "filter",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Visits every element; result up to n elements.",
    },
  },
  {
    name: "reduce",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Visits every element; accumulator is O(1).",
    },
  },
  {
    name: "reduceRight",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Same as reduce but right-to-left.",
    },
  },
  {
    name: "forEach",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Visits every element; no allocation.",
    },
  },
  {
    name: "find",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Linear scan until predicate is satisfied.",
    },
  },
  {
    name: "findIndex",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Linear scan until predicate is satisfied.",
    },
  },
  {
    name: "indexOf",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Linear scan.",
    },
  },
  {
    name: "lastIndexOf",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Reverse linear scan.",
    },
  },
  {
    name: "includes",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Linear scan.",
    },
  },
  {
    name: "sort",
    receiverType: "Array",
    complexity: {
      time: "O(n log n)",
      space: "O(log n)",
      scalesIn: ["n"],
      rationale: "V8 uses TimSort: average O(n log n); stack depth O(log n).",
    },
  },
  {
    name: "reverse",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "In-place swap of elements.",
    },
  },
  {
    name: "flat",
    receiverType: "Array",
    complexity: {
      time: "O(n·d)",
      space: "O(n·d)",
      scalesIn: ["n", "d"],
      rationale: "Flattens d levels; visits up to n·d elements.",
    },
  },
  {
    name: "flatMap",
    receiverType: "Array",
    complexity: {
      time: "O(n·k)",
      space: "O(n·k)",
      scalesIn: ["n", "k"],
      rationale: "map then flat one level; k = avg mapped length.",
    },
  },
  {
    name: "every",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Short-circuits on first false; worst case O(n).",
    },
  },
  {
    name: "some",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Short-circuits on first true; worst case O(n).",
    },
  },
  {
    name: "join",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Concatenates all string representations.",
    },
  },
  {
    name: "fill",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Overwrites up to n elements in place.",
    },
  },
  {
    name: "copyWithin",
    receiverType: "Array",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "In-place copy within the array.",
    },
  },
  {
    name: "entries",
    receiverType: "Array",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Returns an iterator; iteration itself is O(n).",
    },
  },
  {
    name: "keys",
    receiverType: "Array",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Returns an iterator.",
    },
  },
  {
    name: "values",
    receiverType: "Array",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Returns an iterator.",
    },
  },
  // ── Set ───────────────────────────────────────────────────────────────────
  {
    name: "add",
    receiverType: "Set",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hash-based insertion; amortized O(1).",
    },
  },
  {
    name: "delete",
    receiverType: "Set",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hash-based deletion.",
    },
  },
  {
    name: "has",
    receiverType: "Set",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hash-based lookup.",
    },
  },
  {
    name: "clear",
    receiverType: "Set",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Releases all n entries.",
    },
  },
  {
    name: "forEach",
    receiverType: "Set",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Visits every element.",
    },
  },
  {
    name: "values",
    receiverType: "Set",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Returns an iterator.",
    },
  },
  // ── Map ───────────────────────────────────────────────────────────────────
  {
    name: "set",
    receiverType: "Map",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hash-based insertion; amortized O(1).",
    },
  },
  {
    name: "get",
    receiverType: "Map",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hash-based lookup.",
    },
  },
  {
    name: "has",
    receiverType: "Map",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hash-based lookup.",
    },
  },
  {
    name: "delete",
    receiverType: "Map",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hash-based deletion.",
    },
  },
  {
    name: "clear",
    receiverType: "Map",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Releases all n entries.",
    },
  },
  {
    name: "forEach",
    receiverType: "Map",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Visits every key-value pair.",
    },
  },
  {
    name: "keys",
    receiverType: "Map",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Returns an iterator.",
    },
  },
  {
    name: "values",
    receiverType: "Map",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Returns an iterator.",
    },
  },
  {
    name: "entries",
    receiverType: "Map",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Returns an iterator.",
    },
  },
  // ── String ────────────────────────────────────────────────────────────────
  {
    name: "split",
    receiverType: "String",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Scans string; allocates result array.",
    },
  },
  {
    name: "indexOf",
    receiverType: "String",
    complexity: {
      time: "O(n·m)",
      space: "O(1)",
      scalesIn: ["n", "m"],
      rationale: "Naive search: n = haystack length, m = needle length.",
    },
  },
  {
    name: "lastIndexOf",
    receiverType: "String",
    complexity: {
      time: "O(n·m)",
      space: "O(1)",
      scalesIn: ["n", "m"],
      rationale: "Reverse naive search.",
    },
  },
  {
    name: "includes",
    receiverType: "String",
    complexity: {
      time: "O(n·m)",
      space: "O(1)",
      scalesIn: ["n", "m"],
      rationale: "Naive substring search.",
    },
  },
  {
    name: "startsWith",
    receiverType: "String",
    complexity: {
      time: "O(m)",
      space: "O(1)",
      scalesIn: ["m"],
      rationale: "Compares up to m characters from the start.",
    },
  },
  {
    name: "endsWith",
    receiverType: "String",
    complexity: {
      time: "O(m)",
      space: "O(1)",
      scalesIn: ["m"],
      rationale: "Compares up to m characters from the end.",
    },
  },
  {
    name: "slice",
    receiverType: "String",
    complexity: {
      time: "O(k)",
      space: "O(k)",
      scalesIn: ["k"],
      rationale: "Copies k characters.",
    },
  },
  {
    name: "substring",
    receiverType: "String",
    complexity: {
      time: "O(k)",
      space: "O(k)",
      scalesIn: ["k"],
      rationale: "Copies k characters.",
    },
  },
  {
    name: "replace",
    receiverType: "String",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Scans full string; allocates replacement.",
    },
  },
  {
    name: "replaceAll",
    receiverType: "String",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Scans full string; allocates replacement.",
    },
  },
  {
    name: "match",
    receiverType: "String",
    complexity: {
      time: "O(n)",
      space: "O(k)",
      scalesIn: ["n", "k"],
      rationale: "Regex scan; k matches allocated.",
    },
  },
  {
    name: "trim",
    receiverType: "String",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Scans from both ends; allocates trimmed copy.",
    },
  },
  {
    name: "padStart",
    receiverType: "String",
    complexity: {
      time: "O(k)",
      space: "O(k)",
      scalesIn: ["k"],
      rationale: "Allocates k-char padded string.",
    },
  },
  {
    name: "padEnd",
    receiverType: "String",
    complexity: {
      time: "O(k)",
      space: "O(k)",
      scalesIn: ["k"],
      rationale: "Allocates k-char padded string.",
    },
  },
  {
    name: "repeat",
    receiverType: "String",
    complexity: {
      time: "O(n·k)",
      space: "O(n·k)",
      scalesIn: ["n", "k"],
      rationale: "Copies n chars k times.",
    },
  },
  // ── Object ────────────────────────────────────────────────────────────────
  {
    name: "keys",
    receiverType: "Object",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Enumerates all n own enumerable keys.",
    },
  },
  {
    name: "values",
    receiverType: "Object",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Enumerates all n own enumerable values.",
    },
  },
  {
    name: "entries",
    receiverType: "Object",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Enumerates all n own enumerable key-value pairs.",
    },
  },
  {
    name: "assign",
    receiverType: "Object",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Copies n own enumerable properties into target.",
    },
  },
  {
    name: "freeze",
    receiverType: "Object",
    complexity: {
      time: "O(n)",
      space: "O(1)",
      scalesIn: ["n"],
      rationale: "Marks n properties non-writable.",
    },
  },
  // ── JSON ─────────────────────────────────────────────────────────────────
  {
    name: "parse",
    receiverType: "JSON",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Parses all n characters; allocates output tree.",
    },
  },
  {
    name: "stringify",
    receiverType: "JSON",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Serializes all n nodes; allocates string.",
    },
  },
  // ── Math ─────────────────────────────────────────────────────────────────
  {
    name: "sqrt",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Single hardware instruction.",
    },
  },
  {
    name: "pow",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hardware floating-point power.",
    },
  },
  {
    name: "log",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Hardware floating-point logarithm.",
    },
  },
  {
    name: "floor",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Single hardware instruction.",
    },
  },
  {
    name: "ceil",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Single hardware instruction.",
    },
  },
  {
    name: "round",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Single hardware instruction.",
    },
  },
  {
    name: "abs",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "Single hardware instruction.",
    },
  },
  {
    name: "max",
    receiverType: "Math",
    complexity: {
      time: "O(k)",
      space: "O(1)",
      scalesIn: ["k"],
      rationale: "Compares k arguments.",
    },
  },
  {
    name: "min",
    receiverType: "Math",
    complexity: {
      time: "O(k)",
      space: "O(1)",
      scalesIn: ["k"],
      rationale: "Compares k arguments.",
    },
  },
  {
    name: "random",
    receiverType: "Math",
    complexity: {
      time: "O(1)",
      space: "O(1)",
      scalesIn: [],
      rationale: "PRNG output.",
    },
  },
  // ── Promise ───────────────────────────────────────────────────────────────
  {
    name: "all",
    receiverType: "Promise",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Awaits n promises; stores all results.",
    },
  },
  {
    name: "allSettled",
    receiverType: "Promise",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Awaits n promises regardless of rejection.",
    },
  },
  {
    name: "race",
    receiverType: "Promise",
    complexity: {
      time: "O(n)",
      space: "O(n)",
      scalesIn: ["n"],
      rationale: "Registers handlers for n promises; resolves on first.",
    },
  },
];
