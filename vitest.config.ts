import { defineConfig } from "vitest/config";

// app 侧（src/）纯函数单测：与 packages/protocol 的 vitest 相互独立。
// 运行：pnpm run app:test（app:build 的 vue-tsc 会一并类型检查测试文件）。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
