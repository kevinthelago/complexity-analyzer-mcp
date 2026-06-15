import type { BigO } from "./types.js";

// ── Ordinary least-squares linear regression ─────────────────────────────────

interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

function linearRegression(xs: number[], ys: number[]): RegressionResult {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, rSquared: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] ?? 0;
    const y = ys[i] ?? 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) {
    const yMean = sumY / n;
    let ssTot = 0;
    for (let i = 0; i < n; i++) ssTot += ((ys[i] ?? 0) - yMean) ** 2;
    return { slope: 0, intercept: yMean, rSquared: ssTot === 0 ? 1 : 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const y = ys[i] ?? 0;
    const x = xs[i] ?? 0;
    ssTot += (y - yMean) ** 2;
    ssRes += (y - (slope * x + intercept)) ** 2;
  }

  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, rSquared };
}

// ── Multi-model Big-O fitting ─────────────────────────────────────────────────

export interface FitResult {
  bigO: BigO;
  rSquared: number;
}

/**
 * Fit several Big-O growth models against (ns, times) and return the best fit.
 *
 * Primary strategy: log-log regression — regress log(time) on log(n) to
 * estimate the power-law exponent (slope). This is robust to per-call
 * overhead inflating small-n timings, which throws off direct feature
 * regression. Slope thresholds:
 *   < 0.3  → O(1)
 *   0.3–0.65 → O(log n)
 *   0.65–1.5 → O(n) / O(n log n) — resolved by secondary feature check
 *   1.5–2.5 → O(n²)
 *   > 2.5  → O(n³)
 *
 * When only 2 reliable timing points exist (sub-microsecond floor filters
 * small n on fast machines), the slope is derived from the outermost pair
 * — still accurate for large-n dominated growth.
 *
 * Fallback: multi-model feature regression when all timings are below the
 * measurement floor.
 */
export function fitBigO(ns: number[], times: number[]): FitResult {
  if (ns.length < 3) return { bigO: "unknown", rSquared: 0 };

  // Guard against constant times (no growth signal).
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  if (maxTime === 0 || (maxTime - minTime) / maxTime < 0.05) {
    return { bigO: "O(1)", rSquared: 1 };
  }

  // Collect points where timing is above the JIT/overhead floor.
  // At small n the function completes far faster than V8's JIT startup and
  // per-call overhead (~0.02–0.05 ms), so the measured time is essentially
  // constant regardless of n. Including those flat points drags the log-log
  // slope toward 0 and produces systematic misclassification. Filter them
  // out; the remaining large-n points give a clean growth signal.
  const MIN_MS = 0.05;
  const valid = ns
    .map((n, i) => ({ n, t: times[i] ?? 0 }))
    .filter(({ n, t }) => n > 0 && t >= MIN_MS);

  if (valid.length >= 2) {
    const first = valid[0]!;
    const last = valid[valid.length - 1]!;

    let slope: number;
    let rSquared: number;

    const logNs = valid.map(({ n }) => Math.log(n));
    const logTs = valid.map(({ t }) => Math.log(t));

    if (valid.length >= 3) {
      // Full OLS regression in log-log space.
      ({ slope, rSquared } = linearRegression(logNs, logTs));
    } else {
      // Only 2 reliable points — compute the exact pairwise exponent.
      // With 2 points R² is trivially 1 (perfect 2-point fit), so use
      // a conservative 0.85 to signal medium confidence to callers.
      slope =
        (Math.log(last.t) - Math.log(first.t)) /
        (Math.log(last.n) - Math.log(first.n));
      rSquared = 0.85;
    }

    let bigO: BigO;
    if (slope < 0.3) {
      bigO = "O(1)";
    } else if (slope < 0.65) {
      bigO = "O(log n)";
    } else if (slope < 1.5) {
      // Log-log slope ≈ 1 for both O(n) and O(n log n).
      // Use a secondary R² comparison on raw features to distinguish them.
      const rawNs = valid.map(({ n }) => n);
      const rawTs = valid.map(({ t }) => t);
      const r2N = linearRegression(rawNs, rawTs).rSquared;
      const r2NLogN = linearRegression(
        rawNs.map((n) => n * Math.log(n)),
        rawTs,
      ).rSquared;
      bigO = r2NLogN > r2N + 0.02 ? "O(n log n)" : "O(n)";
    } else if (slope < 2.5) {
      bigO = "O(n²)";
    } else {
      bigO = "O(n³)";
    }

    return { bigO, rSquared: Math.max(0, rSquared) };
  }

  // Fallback: all timings are below the resolution floor — direct feature
  // regression against raw times is the only option.
  return fitBigOByFeature(ns, times);
}

// ── Feature-based fallback ────────────────────────────────────────────────────

interface Model {
  bigO: BigO;
  transform: (n: number) => number;
}

const MODELS: Model[] = [
  { bigO: "O(1)", transform: () => 1 },
  { bigO: "O(log n)", transform: (n) => Math.log2(n) },
  { bigO: "O(n)", transform: (n) => n },
  { bigO: "O(n log n)", transform: (n) => n * Math.log2(n) },
  { bigO: "O(n²)", transform: (n) => n * n },
  { bigO: "O(n³)", transform: (n) => n * n * n },
];

function fitBigOByFeature(ns: number[], times: number[]): FitResult {
  let best: FitResult = { bigO: "O(n)", rSquared: Number.NEGATIVE_INFINITY };

  for (const { bigO, transform } of MODELS) {
    const xs = ns.map(transform);
    if (xs.some((x) => !Number.isFinite(x))) continue;

    const { rSquared } = linearRegression(xs, times);
    if (rSquared > best.rSquared) {
      best = { bigO, rSquared };
    }
  }

  return { bigO: best.bigO, rSquared: Math.max(0, best.rSquared) };
}
