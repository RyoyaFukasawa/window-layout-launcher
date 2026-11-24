import { defineConfig } from "@playwright/test";

// 実際の拡張機能（dist/）を Chromium に読み込んで、設定画面などを本物のマウス操作で確かめる。
// 先に `npm run build` しておくこと（npm run e2e は自動でビルドする）
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
