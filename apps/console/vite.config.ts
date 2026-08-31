import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.RADAS_APP_VERSION || "dev"),
  },
  plugins: [
    TanStackRouterVite({
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
      routeFileIgnorePattern: "\\.test\\.",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@office": path.resolve(__dirname, "src/office-app"),
      "@shared": path.resolve(__dirname, "src/office-app/shared"),
    },
  },
  server: {
    port: 8080,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:5001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // The office floor intentionally bundles Monaco and its language workers;
    // keep Vite's warning threshold above the measured 5.8 MB office chunk.
    chunkSizeWarningLimit: 7000,
  },
});
