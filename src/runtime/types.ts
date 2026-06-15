export type BigO = string;
export type Confidence = "high" | "medium" | "low";

/**
 * Empirical complexity result produced by the sandbox sweep + curve fit.
 * Written to AnalysisResult.units[n].empirical once the schema contract lands.
 */
export interface EmpiricalResult {
  bigO: BigO;
  rSquared: number;
  confidence: Confidence;
  /** "agree" = static & empirical match; "diverge" = mismatch; "inconclusive" = R² too low */
  reconciliation: "agree" | "diverge" | "inconclusive";
}

export interface MeasureOptions {
  /** Absolute path to the file exporting the target function. */
  targetPath: string;
  /** Name of the exported function to benchmark. */
  exportName: string;
  /**
   * JS expression string that resolves to `(n: number) => unknown | unknown[]`.
   * Return a single value or an array to spread as function arguments.
   * Runs inside the sandbox — must be eval-safe serialisable logic.
   */
  generatorCode: string;
  /** Known static time Big-O for reconciliation (e.g. "O(n²)"). */
  staticTimeComplexity?: BigO;
  /** Input sizes to sweep (default: [10, 100, 1_000, 10_000, 100_000]). */
  inputSizes?: number[];
  /** Warmup iterations per size before timing starts (default: 3). */
  warmup?: number;
  /** Timed trials per size; median is used (default: 5). */
  trials?: number;
  /** Wall-clock timeout for the entire sweep in ms (default: 30_000). */
  timeoutMs?: number;
  /** Memory cap for the worker in MB (default: 256). */
  memoryMB?: number;
}

export interface MeasureOutcome {
  status: "ok" | "timeout" | "oom" | "error" | "skipped";
  empirical?: EmpiricalResult;
  errorMessage?: string;
  skipReason?: string;
}

// ── Internal worker protocol ──────────────────────────────────────────────────

export interface WorkerInput {
  targetPath: string;
  exportName: string;
  generatorCode: string;
  inputSizes: number[];
  warmup: number;
  trials: number;
}

export interface SizeResult {
  n: number;
  medianMs: number;
}

export type WorkerOutput =
  | { status: "ok"; results: SizeResult[] }
  | { status: "error"; errorMessage: string };
