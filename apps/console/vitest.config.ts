import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Test-only config. Deliberately separate from vite.config.ts so `vite build`
// (router plugin, tailwind, dev proxy) is untouched by the test harness.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@office": path.resolve(__dirname, "src/office-app"),
      "@shared": path.resolve(__dirname, "src/office-app/shared"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
