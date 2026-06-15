import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "mcp/index": "src/mcp/index.ts" },
    format: ["esm"],
    target: "node22",
    platform: "node",
    outDir: "dist",
    dts: true,
    sourcemap: true,
    clean: true,
    shims: false,
  },
  {
    entry: { "cli/index": "src/cli/index.ts" },
    format: ["esm"],
    target: "node22",
    platform: "node",
    outDir: "dist",
    dts: false,
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
    shims: false,
  },
  {
    entry: { "engine/index": "src/engine/index.ts" },
    format: ["esm"],
    target: "node22",
    platform: "node",
    outDir: "dist",
    dts: true,
    sourcemap: true,
    shims: false,
  },
  {
    // Public API for the runtime module
    entry: { "runtime/index": "src/runtime/index.ts" },
    format: ["esm"],
    target: "node22",
    platform: "node",
    outDir: "dist",
    dts: true,
    sourcemap: true,
    shims: false,
  },
  {
    // Worker thread — compiled as a separate entry so sandbox.ts can reference it by path
    entry: { "runtime/worker": "src/runtime/worker.ts" },
    format: ["esm"],
    target: "node22",
    platform: "node",
    outDir: "dist",
    dts: false,
    sourcemap: true,
    shims: false,
  },
]);
