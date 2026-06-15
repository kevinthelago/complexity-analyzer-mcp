import { beforeEach, describe, expect, it, vi } from "vitest";
import { measure } from "../../../runtime/index.js";
import tool from "../measure-complexity.js";

vi.mock("../../../runtime/index.js", () => ({
  measure: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(measure).mockReset();
});

describe("measure_complexity tool", () => {
  it("has the correct name and a non-empty description", () => {
    expect(tool.name).toBe("measure_complexity");
    expect(typeof tool.description).toBe("string");
    expect(tool.description.length).toBeGreaterThan(0);
    expect(tool.inputShape).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("returns empirical result on success", async () => {
    vi.mocked(measure).mockResolvedValue({
      status: "ok",
      empirical: { bigO: "O(n)", rSquared: 0.99, confidence: "high", reconciliation: "agree" },
    });
    const result = await tool.execute({
      targetPath: "/tmp/test.js",
      exportName: "myFn",
      generatorCode: "(n) => [Array.from({length: n}, (_, i) => i)]",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as {
      status: string;
      empirical: { bigO: string };
    };
    expect(data.status).toBe("ok");
    expect(data.empirical.bigO).toBe("O(n)");
  });

  it("returns timeout outcome as structured output (not isError)", async () => {
    vi.mocked(measure).mockResolvedValue({ status: "timeout", errorMessage: "timed out" });
    const result = await tool.execute({
      targetPath: "/tmp/test.js",
      exportName: "slowFn",
      generatorCode: "(n) => [n]",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { status: string };
    expect(data.status).toBe("timeout");
  });

  it("returns error outcome as structured output (not isError)", async () => {
    vi.mocked(measure).mockResolvedValue({ status: "error", errorMessage: "Worker crashed" });
    const result = await tool.execute({
      targetPath: "/tmp/test.js",
      exportName: "badFn",
      generatorCode: "(n) => [n]",
    });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text ?? "{}") as { status: string };
    expect(data.status).toBe("error");
  });

  it("passes optional parameters through to measure", async () => {
    vi.mocked(measure).mockResolvedValue({
      status: "ok",
      empirical: {
        bigO: "O(n²)",
        rSquared: 0.995,
        confidence: "high",
        reconciliation: "diverge",
      },
    });
    await tool.execute({
      targetPath: "/tmp/test.js",
      exportName: "fn",
      generatorCode: "(n) => [n]",
      staticTimeComplexity: "O(n)",
      inputSizes: [10, 100],
      warmup: 1,
      trials: 3,
      timeoutMs: 5000,
      memoryMB: 128,
    });
    expect(vi.mocked(measure)).toHaveBeenCalledWith(
      expect.objectContaining({
        staticTimeComplexity: "O(n)",
        inputSizes: [10, 100],
        warmup: 1,
        trials: 3,
        timeoutMs: 5000,
        memoryMB: 128,
      }),
    );
  });

  it("omits undefined optional parameters from the measure call", async () => {
    vi.mocked(measure).mockResolvedValue({ status: "ok" });
    await tool.execute({
      targetPath: "/tmp/test.js",
      exportName: "fn",
      generatorCode: "(n) => [n]",
    });
    const call = vi.mocked(measure).mock.calls[0]?.[0];
    expect(call).not.toHaveProperty("staticTimeComplexity");
    expect(call).not.toHaveProperty("inputSizes");
    expect(call).not.toHaveProperty("warmup");
    expect(call).not.toHaveProperty("trials");
    expect(call).not.toHaveProperty("timeoutMs");
    expect(call).not.toHaveProperty("memoryMB");
  });
});
