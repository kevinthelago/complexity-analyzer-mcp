import { existsSync } from "node:fs";
import { runInSandbox } from "./sandbox.js";
import { fitBigO } from "./curve-fit.js";
import type { BigO, Confidence, EmpiricalResult, MeasureOptions, MeasureOutcome } from "./types.js";

export type { BigO, Confidence, EmpiricalResult, MeasureOptions, MeasureOutcome } from "./types.js";

// ── Contract thresholds (from contracts/empirical-result.md) ─────────────────

const R2_HIGH = 0.95;
const R2_MEDIUM = 0.85;

const DEFAULT_SIZES = [10, 100, 1_000, 10_000, 100_000];
const DEFAULT_WARMUP = 3;
const DEFAULT_TRIALS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_MB = 256;

function confidence(r2: number): Confidence {
  if (r2 >= R2_HIGH) return "high";
  if (r2 >= R2_MEDIUM) return "medium";
  return "low";
}

function reconcile(
  empiricalBigO: BigO,
  staticBigO: BigO | undefined,
  r2: number,
): "agree" | "diverge" | "inconclusive" {
  if (r2 < R2_MEDIUM || !staticBigO) return "inconclusive";
  return empiricalBigO === staticBigO ? "agree" : "diverge";
}

/**
 * Run the target function in an out-of-process worker_thread sandbox, sweep
 * input sizes, fit a complexity curve, and return an empirical Big-O estimate.
 *
 * Never throws — all errors are captured in MeasureOutcome.status.
 */
export async function measure(opts: MeasureOptions): Promise<MeasureOutcome> {
  const {
    targetPath,
    exportName,
    generatorCode,
    staticTimeComplexity,
    inputSizes = DEFAULT_SIZES,
    warmup = DEFAULT_WARMUP,
    trials = DEFAULT_TRIALS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    memoryMB = DEFAULT_MEMORY_MB,
  } = opts;

  if (!existsSync(targetPath)) {
    return { status: "error", errorMessage: `Target file not found: ${targetPath}` };
  }

  const result = await runInSandbox(
    { targetPath, exportName, generatorCode, inputSizes, warmup, trials },
    { timeoutMs, memoryMB },
  );

  if (result.status === "error") {
    if (result.errorMessage === "timeout") {
      return { status: "timeout", errorMessage: `Worker timed out after ${timeoutMs}ms` };
    }
    return { status: "error", errorMessage: result.errorMessage };
  }

  const measurements = result.results;

  if (measurements.length < 3) {
    return {
      status: "error",
      errorMessage: `Insufficient data points for curve fitting (got ${measurements.length}, need ≥3)`,
    };
  }

  const ns = measurements.map((m) => m.n);
  const times = measurements.map((m) => m.medianMs);
  const { bigO, rSquared } = fitBigO(ns, times);

  const empirical: EmpiricalResult = {
    bigO,
    rSquared,
    confidence: confidence(rSquared),
    reconciliation: reconcile(bigO, staticTimeComplexity, rSquared),
  };

  return { status: "ok", empirical };
}
