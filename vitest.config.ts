import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    dir: "./src/tests/unit",
    globals: true,
    // Phase 1 核心链路测试均为纯逻辑（无 DOM），用 node 环境可让 node:sqlite
    // 等内置模块直接 require 而无需打包；组件测试可用 `// @vitest-environment jsdom` 单独切回。
    environment: "node",
    setupFiles: "./src/tests/unit/setup.ts",
    css: true,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*"],
      exclude: ["src/components/ui/**", "src/components/ai-elements/**"],
    },
  },
});
