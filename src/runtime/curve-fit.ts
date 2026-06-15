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
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 1 };

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

interface Model {
  bigO: BigO;
  /** Transform n → feature value for linear regression against time. */
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

export interface FitResult {
  bigO: BigO;
  rSquared: number;
}

/**
 * Fit several Big-O growth models against (ns, times) and return the best fit.
 *
 * For each model f(n), we regress time = a·f(n) + b and take R² as the fit
 * quality. The model with the highest R² wins; ties break in favour of simpler
 * models (list order above).
 *
 * Requires at least 3 data points; returns { bigO: "unknown", rSquared: 0 }
 * if there are fewer or if all points have identical time (no signal).
 */
export function fitBigO(ns: number[], times: number[]): FitResult {
  if (ns.length < 3) return { bigO: "unknown", rSquared: 0 };

  // Guard against all-zero or constant times (no growth signal)
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  if (maxTime === 0 || maxTime - minTime < 1e-9) {
    return { bigO: "O(1)", rSquared: 1 };
  }

  let best: FitResult = { bigO: "O(n)", rSquared: Number.NEGATIVE_INFINITY };

  for (const { bigO, transform } of MODELS) {
    const xs = ns.map(transform);
    // Skip degenerate features (e.g. log(0) = -Infinity)
    if (xs.some((x) => !Number.isFinite(x))) continue;

    const { rSquared } = linearRegression(xs, times);
    if (rSquared > best.rSquared) {
      best = { bigO, rSquared };
    }
  }

  return { bigO: best.bigO, rSquared: Math.max(0, best.rSquared) };
}
