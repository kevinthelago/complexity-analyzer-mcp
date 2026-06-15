import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { WorkerInput, WorkerOutput } from "./types.js";

// Resolve the worker path: .ts when running from source (tests/dev), .js in compiled output.
const WORKER_TS = fileURLToPath(new URL("./worker.ts", import.meta.url));
const WORKER_JS = fileURLToPath(new URL("./worker.js", import.meta.url));

function resolveWorker(): { path: string; execArgv: string[] } {
  if (existsSync(WORKER_TS)) {
    // Source mode — use tsx to load TypeScript
    return { path: WORKER_TS, execArgv: ["--import", "tsx/esm"] };
  }
  return { path: WORKER_JS, execArgv: [] };
}

/**
 * Spawn a worker to run the full measurement sweep.
 * Returns the worker's final message or an error outcome.
 *
 * The worker is given `timeoutMs` total for all input sizes. If it exceeds
 * the limit, it is terminated and this returns an error with message "timeout".
 */
export async function runInSandbox(
  input: WorkerInput,
  opts: { timeoutMs: number; memoryMB: number },
): Promise<WorkerOutput> {
  const { path, execArgv } = resolveWorker();

  return new Promise<WorkerOutput>((resolve) => {
    const worker = new Worker(path, {
      execArgv,
      workerData: input,
      resourceLimits: {
        maxOldGenerationSizeMb: opts.memoryMB,
        maxYoungGenerationSizeMb: Math.max(32, Math.floor(opts.memoryMB / 4)),
      },
    });

    let settled = false;
    const settle = (out: WorkerOutput): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        // Terminate asynchronously to avoid blocking resolve
        void worker.terminate();
        resolve(out);
      }
    };

    const timer = setTimeout(() => {
      settle({ status: "error", errorMessage: "timeout" });
    }, opts.timeoutMs);

    worker.on("message", (msg: WorkerOutput) => {
      settle(msg);
    });

    worker.on("error", (err) => {
      settle({ status: "error", errorMessage: err.message });
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        settle({ status: "error", errorMessage: `Worker exited with code ${code}` });
      }
    });
  });
}
