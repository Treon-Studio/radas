/**
 * pm2 local-development orchestration for the Radas stack.
 *
 * First-time setup (once):
 *   cd apps/opensible-server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
 *
 * Commands:
 *   pnpm dev:radas            # start server (:5001) + console (:8080) + worker
 *   pnpm dev:radas:stop       # stop everything (keeps pm2 daemon)
 *   pnpm dev:radas:restart    # restart all apps
 *   pnpm dev:radas:logs       # follow combined logs
 *
 * Ports: server 5001 (PORT env). macOS AirPlay Receiver occupies :5000 by
 * default — either run on 5001 (default here) or free 5000 by disabling
 * AirPlay Receiver in System Settings → General → AirDrop & Handoff, then
 * set `OPEN_SERVER_PORT=5000 pm2 start ecosystem.config.cjs`.
 *
 * The console proxies /api → VITE_API_TARGET (defaults to the server port
 * below in vite.config.ts).
 */
const SERVER_PORT = process.env.OPEN_SERVER_PORT || "5001";
// Dev-only secrets — never use these outside local development.
const SECRET = "dev-only-change-me-0123456789abcdef";

// Load optional .env (gitignored) so DATABASE_URL / GITHUB_OAUTH_* etc. can be
// provided without editing this file. Simple parser — no dotenv dependency.
const fs = require("fs");
const path = require("path");
const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

module.exports = {
  apps: [
    {
      name: "radas-server",
      cwd: "./apps/opensible-server",
      script: ".venv/bin/python",
      args: "app.py",
      interpreter: "none",
      env: {
        PORT: SERVER_PORT,
        DATA_DIR: "./data",
        FLASK_ENV: "development",
        FLASK_DEBUG: "1",
        JWT_SECRET_KEY: SECRET,
        INTERNAL_CALL_SECRET: SECRET,
        GLOBAL_SECRETS_ENCRYPTION_KEY: SECRET,
        WORKER_REGISTRATION_SECRET: SECRET,
        ADMIN_INITIAL_PASSWORD: "admin12345",
        CORS_ALLOWED_ORIGINS: "http://localhost:8080",
        DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost/radas",
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://localhost/radas_test",
      },
    },
    {
      name: "radas-console",
      cwd: "./apps/radas-console",
      script: "pnpm",
      args: "dev",
      env: {
        VITE_API_TARGET: `http://localhost:${SERVER_PORT}`,
      },
    },
    {
      name: "radas-worker",
      cwd: "./apps/opensible-worker",
      script: "go",
      args: "run ./cmd/worker",
      env: {
        WORKER_NAME: "worker-go",
        WORKER_TAGS: "go",
        WORKER_SERVER_URL: `http://127.0.0.1:${SERVER_PORT}`,
        WORKER_TOKEN_FILE: "./data/worker.token",
        DATA_DIR: "./data",
        WORKER_REGISTRATION_SECRET: SECRET,
        WORKER_MAX_CONCURRENCY: "3",
        VAULT_SERVER_HOST: "127.0.0.1",
        VAULT_SERVER_PORT: "9998",
        VAULT_SERVER_SECRET: SECRET,
      },
    },
  ],
};
