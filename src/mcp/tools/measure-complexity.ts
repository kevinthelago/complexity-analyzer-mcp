import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { measure } from "../../runtime/index.js";

const inputSchema = {
  targetPath: z.string().describe("Absolute path to the JS/TS file exporting the target function"),
  exportName: z.string().describe("Name of the exported function to benchmark"),
  generatorCode: z
    .string()
    .describe(
      "JS expression that resolves to (n: number) => args. " +
        "Return a single value or an array to spread as arguments. " +
        "Example: (n) => [Array.from({length: n}, (_,i) => i)]",
    ),
  staticTimeComplexity: z
    .string()
    .optional()
    .describe("Known static time Big-O for reconciliation (e.g. 'O(n²)')"),
  inputSizes: z
    .array(z.number().positive())
    .optional()
    .describe("Input sizes to sweep (default: [10, 100, 1000, 10000, 100000])"),
  warmup: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Warmup iterations per size before timing (default: 3)"),
  trials: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Timed trials per size; median is used (default: 5)"),
  timeoutMs: z
    .number()
    .positive()
    .optional()
    .describe("Total wall-clock timeout for the sweep in ms (default: 30000)"),
  memoryMB: z
    .number()
    .positive()
    .optional()
    .describe("Memory cap for the sandbox worker in MB (default: 256)"),
};

/**
 * Register the measure_complexity tool with the MCP server.
 *
 * The tool runs the target function in an isolated worker_thread sandbox across
 * a sweep of input sizes, fits a Big-O curve, and returns an EmpiricalResult.
 * It is entirely opt-in and never executes code unless explicitly called.
 */
export function register(server: McpServer): void {
  server.tool(
    "measure_complexity",
    "Empirically measure the runtime Big-O of a function by benchmarking it across growing input sizes. " +
      "Returns an empirical Big-O, goodness-of-fit (R²), confidence, and reconciliation against the static verdict. " +
      "The target runs in an isolated worker_thread with memory and time limits. " +
      "Requires a generator function (n) => args to produce inputs of size n.",
    inputSchema,
    async (input) => {
      const outcome = await measure(input);
      return {
        content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }],
      };
    },
  );
}
