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
]);
