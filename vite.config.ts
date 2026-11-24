/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // 単体テストは src の中だけ（e2e/ は Playwright で実行する）
  test: { include: ["src/**/*.test.ts"] },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    target: "chrome120",
    rollupOptions: {
      input: {
        options: path.resolve(import.meta.dirname, "options.html"),
        popup: path.resolve(import.meta.dirname, "popup.html"),
        background: path.resolve(import.meta.dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
