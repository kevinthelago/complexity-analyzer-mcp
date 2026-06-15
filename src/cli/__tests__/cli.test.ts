import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LLMClient } from "../../llm/index.js";
import type { MeasureOutcome } from "../../runtime/index.js";
import {
  type AnalysisOutput,
  formatHuman,
  parseCliArgs,
  runAnalysis,
  runCli,
  runDeepAnalysis,
  runMeasureAnalysis,
} from "../index.js";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockMeasureOk(bigO = "O(n)"): () => Promise<MeasureOutcome> {
  return vi.fn().mockResolvedValue({
    status: "ok",
    empirical: { bigO, rSquared: 0.997, confidence: "high", reconciliation: "agree" },
  } satisfies MeasureOutcome);
}

function mockMeasureError(msg = "Export 'sum' is not a function"): () => Promise<MeasureOutcome> {
  return vi.fn().mockResolvedValue({
    status: "error",
    errorMessage: msg,
  } satisfies MeasureOutcome);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SIMPLE_TS = `
function sum(arr: number[]): number {
  let s = 0;
  for (const x of arr) s += x;
  return s;
}
`;

const NESTED_LOOPS_TS = `
function bubble(arr: number[]): number[] {
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
`;

// ts-morph recovers gracefully from most syntax errors; use clearly nonsensical input
const BROKEN_SRC = "function broken( { return; }";
// This source has no functions — tests "empty units" path
const NO_UNITS_SRC = "const x = 42;";

function mockOkClient(overrides?: object): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue(
      JSON.stringify({
        verifiedTimeComplexity: "O(n)",
        verifiedSpaceComplexity: "O(1)",
        rationale: "Single pass over the array.",
        ...overrides,
      }),
    ),
  };
}

let tmpDir: string;

beforeAll(() => {
  tmpDir = join(tmpdir(), `cli-test-${process.pid}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmp(name: string, content: string): string {
  const p = join(tmpDir, name);
  writeFileSync(p, content, "utf-8");
  return p;
}

// ── runAnalysis ───────────────────────────────────────────────────────────────

describe("runAnalysis", () => {
  it("analyses a simple O(n) function", () => {
    const r = runAnalysis(SIMPLE_TS, "input.ts");
    expect(r.lang).toBe("ts");
    expect(r.parseError).toBeUndefined();
    expect(r.units.length).toBeGreaterThan(0);
    const unit = r.units[0];
    expect(unit?.name).toBe("sum");
    expect(unit?.timeComplexity).toBe("O(n)");
    expect(unit?.spaceComplexity).toBe("O(1)");
  });

  it("analyses nested loops as O(n²)", () => {
    const r = runAnalysis(NESTED_LOOPS_TS, "bubble.ts");
    expect(r.units[0]?.timeComplexity).toBe("O(n²)");
  });

  it("does not throw for broken syntax — ts-morph error-recovers", () => {
    // ts-morph never throws on syntax errors; result is always well-formed
    const r = runAnalysis(BROKEN_SRC, "bad.ts");
    expect(r).toHaveProperty("units");
    expect(Array.isArray(r.units)).toBe(true);
  });

  it("returns empty units for source with no functions", () => {
    const r = runAnalysis(NO_UNITS_SRC, "nounit.ts");
    expect(r.parseError).toBeUndefined();
    expect(r.units).toHaveLength(0);
  });

  it("detects language from extension", () => {
    const r = runAnalysis("function f() { return 1; }", "foo.js");
    expect(r.lang).toBe("js");
  });

  it("respects --lang override", () => {
    const r = runAnalysis("function f() { return 1; }", "foo.txt", "ts");
    expect(r.lang).toBe("ts");
  });

  it("includes recursion info for recursive functions", () => {
    const src = `
      function factorial(n: number): number {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
      }
    `;
    const r = runAnalysis(src, "rec.ts");
    expect(r.units[0]?.recursion?.kind).toBe("linear");
  });
});

// ── runDeepAnalysis ───────────────────────────────────────────────────────────

describe("runDeepAnalysis", () => {
  it("degrades gracefully when no API key (llm_unavailable)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    try {
      const r = await runDeepAnalysis(SIMPLE_TS, "input.ts");
      expect(r.lang).toBe("ts");
      expect(r.units[0]?.llmStatus).toBe("llm_unavailable");
      // static complexities preserved
      expect(r.units[0]?.timeComplexity).toBe("O(n)");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns LLM-enriched result with injected client", async () => {
    const r = await runDeepAnalysis(SIMPLE_TS, "input.ts", undefined, mockOkClient());
    expect(r.units[0]?.llmStatus).toBe("ok");
    expect(r.units[0]?.verifiedTimeComplexity).toBe("O(n)");
    expect(r.units[0]?.llmRationale).toBe("Single pass over the array.");
  });

  it("uses LLM-verified complexities in timeComplexity/spaceComplexity fields", async () => {
    const r = await runDeepAnalysis(
      SIMPLE_TS,
      "input.ts",
      undefined,
      mockOkClient({ verifiedTimeComplexity: "O(n log n)", verifiedSpaceComplexity: "O(n)" }),
    );
    expect(r.units[0]?.timeComplexity).toBe("O(n log n)");
    expect(r.units[0]?.spaceComplexity).toBe("O(n)");
  });

  it("includes alternative when LLM returns one", async () => {
    const client = mockOkClient({
      alternative: {
        code: "return arr.sort((a,b)=>a-b);",
        timeComplexity: "O(n log n)",
        spaceComplexity: "O(1)",
        rationale: "Native sort is faster in practice.",
      },
    });
    const r = await runDeepAnalysis(SIMPLE_TS, "input.ts", undefined, client);
    expect(r.units[0]?.alternative?.timeComplexity).toBe("O(n log n)");
  });

  it("returns empty units for source with no functions", async () => {
    const r = await runDeepAnalysis(NO_UNITS_SRC, "nounit.ts", undefined, mockOkClient());
    expect(r.units).toHaveLength(0);
  });
});

// ── formatHuman ───────────────────────────────────────────────────────────────

describe("formatHuman", () => {
  const baseResult: AnalysisOutput = {
    file: "/tmp/foo.ts",
    lang: "ts",
    units: [],
  };

  it("shows file path in header", () => {
    const out = formatHuman(baseResult);
    expect(out).toContain("/tmp/foo.ts");
    expect(out).toContain("[ts]");
  });

  it("shows 'no functions found' for empty units", () => {
    const out = formatHuman(baseResult);
    expect(out).toContain("No analyzable functions");
  });

  it("shows parse error when present", () => {
    const out = formatHuman({ ...baseResult, parseError: "Unexpected token" });
    expect(out).toContain("Parse error");
    expect(out).toContain("Unexpected token");
  });

  it("shows time, space, and confidence for each unit", () => {
    const result: AnalysisOutput = {
      ...baseResult,
      units: [
        {
          kind: "function",
          name: "sum",
          startLine: 1,
          endLine: 5,
          timeComplexity: "O(n)",
          spaceComplexity: "O(1)",
          confidence: "high",
          uncertainNodes: [],
        },
      ],
    };
    const out = formatHuman(result);
    expect(out).toContain("sum");
    expect(out).toContain("O(n)");
    expect(out).toContain("O(1)");
    expect(out).toContain("high");
  });

  it("shows recursion info when present", () => {
    const result: AnalysisOutput = {
      ...baseResult,
      units: [
        {
          kind: "function",
          name: "fib",
          startLine: 1,
          endLine: 4,
          timeComplexity: "O(2ⁿ)",
          spaceComplexity: "O(2ⁿ)",
          confidence: "medium",
          recursion: { kind: "exponential", rationale: "Two calls without halving." },
          uncertainNodes: [],
        },
      ],
    };
    const out = formatHuman(result);
    expect(out).toContain("exponential");
    expect(out).toContain("Two calls without halving");
  });

  it("shows uncertain nodes when present", () => {
    const result: AnalysisOutput = {
      ...baseResult,
      units: [
        {
          kind: "function",
          name: "f",
          startLine: 1,
          endLine: 3,
          timeComplexity: "unknown",
          spaceComplexity: "O(1)",
          confidence: "low",
          uncertainNodes: [{ description: "Unknown call: custom()", line: 2, col: 5 }],
        },
      ],
    };
    const out = formatHuman(result);
    expect(out).toContain("Unknown call");
  });

  it("shows LLM rationale when llmStatus is ok", () => {
    const result: AnalysisOutput = {
      ...baseResult,
      units: [
        {
          kind: "function",
          name: "sum",
          startLine: 1,
          endLine: 5,
          timeComplexity: "O(n)",
          spaceComplexity: "O(1)",
          confidence: "high",
          uncertainNodes: [],
          llmStatus: "ok",
          llmRationale: "Confirmed by LLM analysis.",
        },
      ],
    };
    const out = formatHuman(result);
    expect(out).toContain("LLM note");
    expect(out).toContain("Confirmed by LLM analysis");
  });

  it("shows alternative when present", () => {
    const result: AnalysisOutput = {
      ...baseResult,
      units: [
        {
          kind: "function",
          name: "bubble",
          startLine: 1,
          endLine: 10,
          timeComplexity: "O(n²)",
          spaceComplexity: "O(1)",
          confidence: "high",
          uncertainNodes: [],
          llmStatus: "ok",
          alternative: {
            code: "arr.sort()",
            timeComplexity: "O(n log n)",
            timeComplexityVerified: false,
            spaceComplexity: "O(1)",
            rationale: "Use native sort for better average performance.",
          },
        },
      ],
    };
    const out = formatHuman(result);
    expect(out).toContain("Alternative");
    expect(out).toContain("O(n log n)");
    expect(out).toContain("native sort");
  });
});

// ── parseCliArgs ──────────────────────────────────────────────────────────────

describe("parseCliArgs", () => {
  it("returns helpText when no args", () => {
    const r = parseCliArgs(["node", "cli"]);
    expect(r.helpText).toBeDefined();
  });

  it("returns helpText for --help", () => {
    const r = parseCliArgs(["node", "cli", "--help"]);
    expect(r.helpText).toBeDefined();
  });

  it("parses analyze <path>", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "src/foo.ts"]);
    expect(r.error).toBeUndefined();
    expect(r.opts.path).toBe("src/foo.ts");
    expect(r.opts.json).toBe(false);
    expect(r.opts.deep).toBe(false);
  });

  it("parses --json flag", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--json"]);
    expect(r.opts.json).toBe(true);
  });

  it("parses --deep flag", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--deep"]);
    expect(r.opts.deep).toBe(true);
  });

  it("parses --lang value", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--lang", "js"]);
    expect(r.opts.lang).toBe("js");
  });

  it("returns error for unknown command", () => {
    const r = parseCliArgs(["node", "cli", "badcmd"]);
    expect(r.error).toContain("Unknown command");
  });

  it("returns error for missing path", () => {
    const r = parseCliArgs(["node", "cli", "analyze"]);
    expect(r.error).toContain("Missing required argument");
  });

  it("returns error for unknown option", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--unknown"]);
    expect(r.error).toContain("Unknown option");
  });
});

// ── runCli ────────────────────────────────────────────────────────────────────

describe("runCli", () => {
  it("returns exitCode 1 for missing file", async () => {
    const r = await runCli({ path: "/nonexistent/path.ts", json: false, deep: false });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("not found");
  });

  it("returns exitCode 1 for a directory path", async () => {
    const r = await runCli({ path: tmpDir, json: false, deep: false });
    expect(r.exitCode).toBe(1);
    expect(r.output).toContain("directory");
  });

  it("supports glob patterns — multiple matches return exitCode 0 with a files array", async () => {
    writeTmp("glob1.ts", SIMPLE_TS);
    writeTmp("glob2.ts", NESTED_LOOPS_TS);
    const pattern = join(tmpDir, "glob*.ts");
    const r = await runCli({ path: pattern, json: true, deep: false });
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.output);
    expect(data).toHaveProperty("files");
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files).toHaveLength(2);
  });

  it("analyses a real file and exits 0", async () => {
    const p = writeTmp("simple.ts", SIMPLE_TS);
    const r = await runCli({ path: p, json: false, deep: false });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("O(n)");
  });

  it("--json emits valid JSON", async () => {
    const p = writeTmp("simple2.ts", SIMPLE_TS);
    const r = await runCli({ path: p, json: true, deep: false });
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.output);
    expect(data).toHaveProperty("units");
    expect(Array.isArray(data.units)).toBe(true);
    expect(data.units[0]).toHaveProperty("timeComplexity");
  });

  it("--json includes file and lang fields", async () => {
    const p = writeTmp("info.ts", SIMPLE_TS);
    const r = await runCli({ path: p, json: true, deep: false });
    const data = JSON.parse(r.output);
    expect(data.lang).toBe("ts");
    expect(typeof data.file).toBe("string");
  });

  it("handles source with no functions gracefully (non-json)", async () => {
    const p = writeTmp("nounit.ts", NO_UNITS_SRC);
    const r = await runCli({ path: p, json: false, deep: false });
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("No analyzable");
  });

  it("handles source with no functions in --json mode", async () => {
    const p = writeTmp("nounit2.ts", NO_UNITS_SRC);
    const r = await runCli({ path: p, json: true, deep: false });
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.output);
    expect(data.units).toHaveLength(0);
  });

  it("--deep without API key degrades gracefully (exit 0)", async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const p = writeTmp("deep.ts", SIMPLE_TS);
      const r = await runCli({ path: p, json: false, deep: true });
      expect(r.exitCode).toBe(0);
      expect(r.output).toContain("ANTHROPIC_API_KEY");
    } finally {
      if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
    }
  });

  it("respects --lang override", async () => {
    const p = writeTmp("noext", "function f() { return 1; }");
    const r = await runCli({ path: p, json: true, deep: false, lang: "js" });
    const data = JSON.parse(r.output);
    expect(data.lang).toBe("js");
  });

  it("--json with --deep includes deepEnabled flag", async () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    // biome-ignore lint/performance/noDelete: process.env requires delete to truly unset
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const p = writeTmp("deep2.ts", SIMPLE_TS);
      const r = await runCli({ path: p, json: true, deep: true });
      expect(r.exitCode).toBe(0);
      const data = JSON.parse(r.output);
      expect(data.deepEnabled).toBe(true);
    } finally {
      if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
    }
  });

  it("--measure with mocked ok measurement attaches empirical data", async () => {
    const p = writeTmp("measure.ts", SIMPLE_TS);
    const r = await runCli({ path: p, json: true, measure: true }, mockMeasureOk());
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.output);
    expect(data.measureEnabled).toBe(true);
    expect(data.units[0].measureStatus).toBe("ok");
    expect(data.units[0].empiricalBigO).toBe("O(n)");
    expect(data.units[0].empiricalR2).toBeCloseTo(0.997);
  });

  it("--measure with error result includes measureStatus error", async () => {
    const p = writeTmp("measure-err.ts", SIMPLE_TS);
    const r = await runCli({ path: p, json: true, measure: true }, mockMeasureError());
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.output);
    expect(data.units[0].measureStatus).toBe("error");
    expect(typeof data.units[0].measureError).toBe("string");
  });

  it("--measure human output shows empirical line for ok measurement", async () => {
    const p = writeTmp("measure-human.ts", SIMPLE_TS);
    const r = await runCli({ path: p, json: false, measure: true }, mockMeasureOk());
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("Empirical");
    expect(r.output).toContain("O(n)");
  });

  it("--measure composes with --json", async () => {
    const p = writeTmp("measure-json.ts", SIMPLE_TS);
    const r = await runCli({ path: p, json: true, deep: false, measure: true }, mockMeasureOk());
    const data = JSON.parse(r.output);
    expect(data.measureEnabled).toBe(true);
    expect(data.units[0]).toHaveProperty("measureStatus");
  });
});

// ── runMeasureAnalysis ────────────────────────────────────────────────────────

describe("runMeasureAnalysis", () => {
  it("attaches empirical data from mock measure", async () => {
    const p = writeTmp("msrc.ts", SIMPLE_TS);
    const r = await runMeasureAnalysis(SIMPLE_TS, p, undefined, undefined, mockMeasureOk("O(n)"));
    expect(r.units[0]?.measureStatus).toBe("ok");
    expect(r.units[0]?.empiricalBigO).toBe("O(n)");
    expect(r.units[0]?.empiricalR2).toBeCloseTo(0.997);
    expect(r.units[0]?.empiricalReconciliation).toBe("agree");
  });

  it("attaches error status when measure fails", async () => {
    const p = writeTmp("msrc-err.ts", SIMPLE_TS);
    const r = await runMeasureAnalysis(SIMPLE_TS, p, undefined, undefined, mockMeasureError());
    expect(r.units[0]?.measureStatus).toBe("error");
    expect(r.units[0]?.measureError).toBeDefined();
  });

  it("returns empty units for source with no functions", async () => {
    const p = writeTmp("msrc-nounit.ts", NO_UNITS_SRC);
    const r = await runMeasureAnalysis(NO_UNITS_SRC, p, undefined, undefined, mockMeasureOk());
    expect(r.units).toHaveLength(0);
  });
});

// ── parseCliArgs --measure / --generator ─────────────────────────────────────

describe("parseCliArgs — --measure and --generator", () => {
  it("parses --measure flag", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--measure"]);
    expect(r.opts.measure).toBe(true);
  });

  it("parses --generator value", () => {
    const gen = "(n) => [n]";
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--measure", "--generator", gen]);
    expect(r.opts.generator).toBe(gen);
  });

  it("returns error when --generator has no value", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--generator"]);
    expect(r.error).toContain("--generator requires a value");
  });

  it("--measure and --deep can be combined", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--measure", "--deep"]);
    expect(r.opts.measure).toBe(true);
    expect(r.opts.deep).toBe(true);
  });

  it("--measure and --json can be combined", () => {
    const r = parseCliArgs(["node", "cli", "analyze", "foo.ts", "--measure", "--json"]);
    expect(r.opts.measure).toBe(true);
    expect(r.opts.json).toBe(true);
  });
});
