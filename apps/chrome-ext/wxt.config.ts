

import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    manifest_version: 3,
    permissions: ["identity"],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval' http://localhost:3000 http://localhost:3001 http://localhost:5173; object-src 'self';"
    }
  },
  modules: ["@wxt-dev/module-react"],
  webExt: {
    startUrls: ["https://google.com"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    server: {
      port: 3000,
      strictPort: true
    }
  }),
});
