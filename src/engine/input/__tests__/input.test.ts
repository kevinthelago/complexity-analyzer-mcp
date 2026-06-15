import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInput } from "../index.js";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "input-test-"));
}

describe("resolveInput — code mode", () => {
  it("returns a single entry for inline code", async () => {
    const result = await resolveInput({ code: "const x = 1;" });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.source).toBe("const x = 1;");
    expect(result.entries[0]?.filename).toBe("input.ts");
  });

  it("uses the provided filename", async () => {
    const result = await resolveInput({ code: "const x = 1;", filename: "widget.tsx" });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.entries[0]?.filename).toBe("widget.tsx");
  });

  it("rejects oversized code", async () => {
    const big = "x".repeat(300 * 1024);
    const result = await resolveInput({ code: big }, 256 * 1024);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toMatch(/limit/i);
  });
});

describe("resolveInput — path mode", () => {
  it("reads a single file by path", async () => {
    const dir = makeTempDir();
    const file = join(dir, "sample.ts");
    writeFileSync(file, "function f() {}");
    const result = await resolveInput({ path: file });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.source).toBe("function f() {}");
    expect(result.entries[0]?.filename).toMatch(/sample\.ts$/);
  });

  it("returns an error for a missing path", async () => {
    const result = await resolveInput({ path: "/nonexistent/file.ts" });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toMatch(/not found/i);
  });

  it("rejects oversized files", async () => {
    const dir = makeTempDir();
    const file = join(dir, "big.ts");
    writeFileSync(file, "x".repeat(10));
    const result = await resolveInput({ path: file }, 5);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toMatch(/limit/i);
  });
});

describe("resolveInput — glob mode", () => {
  it("expands a glob pattern to multiple entries", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "a.ts"), "function a() {}");
    writeFileSync(join(dir, "b.ts"), "function b() {}");
    const result = await resolveInput({ glob: "*.ts", cwd: dir });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.entries).toHaveLength(2);
    const names = result.entries.map((e) => e.filename);
    expect(names.some((n) => n.endsWith("a.ts"))).toBe(true);
    expect(names.some((n) => n.endsWith("b.ts"))).toBe(true);
  });

  it("returns zero entries for an empty glob — not an error", async () => {
    const dir = makeTempDir();
    const result = await resolveInput({ glob: "*.ts", cwd: dir });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.entries).toHaveLength(0);
  });

  it("returns an error when a matched file is oversized", async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "big.ts"), "x".repeat(10));
    const result = await resolveInput({ glob: "*.ts", cwd: dir }, 5);
    expect(result.kind).toBe("error");
  });
});
