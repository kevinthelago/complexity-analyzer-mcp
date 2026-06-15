import { describe, expect, it } from "vitest";
import { fitBigO } from "../curve-fit.js";

// Generate (n, time) pairs for a known complexity model.
function syntheticData(
  transform: (n: number) => number,
  sizes = [10, 100, 1_000, 10_000, 100_000],
  noiseFactor = 0.02,
): { ns: number[]; times: number[] } {
  const base = transform(sizes[0] ?? 10);
  const scale = 1e-6 / base; // normalise so times are in microsecond range
  // Add a small constant overhead and proportional noise
  const times = sizes.map((n) => {
    const ideal = transform(n) * scale + 5e-7; // 0.5 µs overhead
    const noise = ideal * noiseFactor * (Math.random() * 2 - 1);
    return Math.max(1e-9, ideal + noise);
  });
  return { ns: sizes, times };
}

describe("fitBigO", () => {
  it("returns unknown for fewer than 3 data points", () => {
    const result = fitBigO([10, 100], [1, 2]);
    expect(result.bigO).toBe("unknown");
    expect(result.rSquared).toBe(0);
  });

  it("classifies O(1) constant time", () => {
    const ns = [10, 100, 1_000, 10_000, 100_000];
    const times = ns.map(() => 1e-6 + Math.random() * 1e-8); // flat ~1µs
    const result = fitBigO(ns, times);
    expect(result.bigO).toBe("O(1)");
    expect(result.rSquared).toBeGreaterThan(0.7);
  });

  it("classifies O(n) linear growth", () => {
    const { ns, times } = syntheticData((n) => n);
    const result = fitBigO(ns, times);
    expect(result.bigO).toBe("O(n)");
    expect(result.rSquared).toBeGreaterThan(0.98);
  });

  it("classifies O(n log n) super-linear growth", () => {
    const { ns, times } = syntheticData((n) => n * Math.log2(n));
    const result = fitBigO(ns, times);
    // n log n can overlap with O(n) for small sizes; accept either O(n) or O(n log n)
    expect(["O(n)", "O(n log n)"]).toContain(result.bigO);
    expect(result.rSquared).toBeGreaterThan(0.98);
  });

  it("classifies O(n²) quadratic growth", () => {
    const { ns, times } = syntheticData((n) => n * n, [10, 50, 100, 500, 1_000]);
    const result = fitBigO(ns, times);
    expect(result.bigO).toBe("O(n²)");
    expect(result.rSquared).toBeGreaterThan(0.98);
  });

  it("classifies O(n³) cubic growth", () => {
    const { ns, times } = syntheticData((n) => n * n * n, [10, 30, 50, 100, 200]);
    const result = fitBigO(ns, times);
    expect(result.bigO).toBe("O(n³)");
    expect(result.rSquared).toBeGreaterThan(0.98);
  });

  it("classifies O(log n) logarithmic growth", () => {
    const { ns, times } = syntheticData((n) => Math.log2(n));
    const result = fitBigO(ns, times);
    expect(result.bigO).toBe("O(log n)");
    expect(result.rSquared).toBeGreaterThan(0.9);
  });

  it("returns rSquared in [0, 1]", () => {
    const ns = [10, 100, 1_000];
    const times = [1, 100, 10]; // non-monotonic junk
    const result = fitBigO(ns, times);
    expect(result.rSquared).toBeGreaterThanOrEqual(0);
    expect(result.rSquared).toBeLessThanOrEqual(1);
  });

  it("handles all-equal times as O(1)", () => {
    const ns = [10, 100, 1_000, 10_000];
    const times = [5e-6, 5e-6, 5e-6, 5e-6];
    const result = fitBigO(ns, times);
    expect(result.bigO).toBe("O(1)");
  });
});
