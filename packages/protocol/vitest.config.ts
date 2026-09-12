import { defineConfig } from "vitest/config";

// 显式局部配置：仓库根有 app 侧 vitest.config.ts（include src/**），vitest 会
// 向上搜索配置，若不在此固定 tests/** 会导致 protocol 用例发现不到。
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
