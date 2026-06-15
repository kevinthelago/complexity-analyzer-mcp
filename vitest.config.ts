import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "test/**/*.test.ts", "test/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/engine/**"],
      exclude: ["src/mcp/**", "src/cli/**"],
    },
  },
});
