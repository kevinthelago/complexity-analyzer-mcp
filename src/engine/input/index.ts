import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { glob } from "tinyglobby";

const DEFAULT_MAX_BYTES = 256 * 1024;

export interface SourceEntry {
  source: string;
  filename: string;
}

export interface CodeInput {
  code: string;
  filename?: string;
}

export interface PathInput {
  path: string;
}

export interface GlobInput {
  glob: string;
  cwd?: string;
}

export type InputSpec = CodeInput | PathInput | GlobInput;

export interface InputError {
  kind: "error";
  message: string;
}

export interface InputResult {
  kind: "ok";
  entries: SourceEntry[];
}

export type ResolveResult = InputResult | InputError;

function isCodeInput(spec: InputSpec): spec is CodeInput {
  return "code" in spec;
}

function isPathInput(spec: InputSpec): spec is PathInput {
  return "path" in spec;
}

function readFileSafe(filePath: string, maxBytes: number): { source: string } | { error: string } {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch {
    return { error: `Path not found: ${filePath}` };
  }
  if (stat.size > maxBytes) {
    return { error: `File exceeds ${maxBytes / 1024} KB limit: ${filePath}` };
  }
  try {
    return { source: readFileSync(filePath, "utf8") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Resolves an InputSpec into an array of SourceEntry objects.
 * - CodeInput: validates size, returns single entry.
 * - PathInput: reads file, validates size, returns single entry.
 * - GlobInput: expands pattern, reads all matched files, returns entries for each.
 *   Empty glob is not an error — returns zero entries.
 */
export async function resolveInput(
  spec: InputSpec,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<ResolveResult> {
  if (isCodeInput(spec)) {
    const byteLen = Buffer.byteLength(spec.code, "utf8");
    if (byteLen > maxBytes) {
      return { kind: "error", message: `Input exceeds the ${maxBytes / 1024} KB limit` };
    }
    return {
      kind: "ok",
      entries: [{ source: spec.code, filename: spec.filename ?? "input.ts" }],
    };
  }

  if (isPathInput(spec)) {
    const absPath = resolve(spec.path);
    const read = readFileSafe(absPath, maxBytes);
    if ("error" in read) {
      return { kind: "error", message: read.error };
    }
    return {
      kind: "ok",
      entries: [{ source: read.source, filename: basename(absPath) }],
    };
  }

  // GlobInput — normalize backslashes so tinyglobby works on Windows paths
  const cwd = spec.cwd ? resolve(spec.cwd) : process.cwd();
  const normalizedGlob = spec.glob.replace(/\\/g, "/");
  let matched: string[];
  try {
    matched = await glob(normalizedGlob, { cwd, absolute: true });
  } catch (e) {
    return {
      kind: "error",
      message: `Glob expansion failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const entries: SourceEntry[] = [];
  for (const filePath of matched) {
    const read = readFileSafe(filePath, maxBytes);
    if ("error" in read) {
      return { kind: "error", message: read.error };
    }
    entries.push({ source: read.source, filename: filePath });
  }

  return { kind: "ok", entries };
}
