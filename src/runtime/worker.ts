import { performance } from "node:perf_hooks";
/**
 * Worker thread: imports the target function, runs warmup + timed trials
 * for each requested input size, and posts back the median times.
 *
 * This file is loaded as a separate worker_thread entry — never import it
 * directly from the main process.
 */
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import type { SizeResult, WorkerInput, WorkerOutput } from "./types.js";

const { targetPath, exportName, generatorCode, inputSizes, warmup, trials } =
  workerData as WorkerInput;

// biome-ignore lint/security/noGlobalEval: controlled sandbox — caller trusts the code
const generator = eval(`(${generatorCode})`) as (n: number) => unknown;

function toArgs(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [raw];
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function run(): Promise<void> {
  try {
    const targetUrl = pathToFileURL(targetPath).href;
    const mod = (await import(targetUrl)) as Record<string, unknown>;
    const fn = mod[exportName];
    if (typeof fn !== "function") {
      const out: WorkerOutput = {
        status: "error",
        errorMessage: `Export '${exportName}' is not a function in ${targetPath}`,
      };
      parentPort?.postMessage(out);
      return;
    }

    const results: SizeResult[] = [];

    for (const n of inputSizes) {
      // Warmup — let the JIT compile and settle
      for (let i = 0; i < warmup; i++) {
        (fn as (...a: unknown[]) => unknown)(...toArgs(generator(n)));
      }

      // Timed trials
      const timings: number[] = [];
      for (let i = 0; i < trials; i++) {
        const args = toArgs(generator(n));
        const t0 = performance.now();
        (fn as (...a: unknown[]) => unknown)(...args);
        timings.push(performance.now() - t0);
      }

      results.push({ n, medianMs: median(timings) });
    }

    const out: WorkerOutput = { status: "ok", results };
    parentPort?.postMessage(out);
  } catch (err) {
    const out: WorkerOutput = {
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    parentPort?.postMessage(out);
  }
}

run();
