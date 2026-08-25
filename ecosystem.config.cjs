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
const crypto = require("crypto");

// Local-development fallbacks are generated per launch. Production values must
// come from the environment and are never replaced with repository-known text.
const DEV_SECRET = crypto.randomBytes(48).toString("base64url");

// Load the process .env before resolving any runtime configuration. It is the
// explicit source of truth for PM2; no secret or database URL is hard-coded
// below. Simple parser — no dotenv dependency.
const fs = require("fs");
const path = require("path");
const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) {
      // The repository .env is the sole PM2 configuration source; do not let
      // an inherited shell value silently override it.
      process.env[m[1]] = m[2].replace(/^['\"]|['\"]$/g, "");
    }
  }
}

// Production has one indicator everywhere: FLASK_ENV=production. Values are
// normalized for comparison and for the child-process environment. APP_ENV and
// ENVIRONMENT are intentionally not production switches.
const normalizedFlaskEnv = String(process.env.FLASK_ENV || "development").trim().toLowerCase();
const isProduction = normalizedFlaskEnv === "production";
const childFlaskEnv = normalizedFlaskEnv || "development";
const normalizedFlaskDebug = String(process.env.FLASK_DEBUG || "").trim().toLowerCase();
const productionDebugEnabled = ["1", "true", "yes", "on"].includes(normalizedFlaskDebug);
if (isProduction && productionDebugEnabled) {
  throw new Error("FLASK_DEBUG must be disabled in production");
}
const childFlaskDebug = isProduction ? "0" : (process.env.FLASK_DEBUG || "1");

const KNOWN_REPOSITORY_SECRETS = new Set([
  "dev-only-change-me-0123456789abcdef",
  "radas-preview-dev-secret",
]);

function requireStrongProductionSecret(name, value) {
  const secret = String(value || "").trim();
  if (!isProduction) return secret;
  if (!secret) throw new Error(`${name} must be explicitly configured in production`);
  if (KNOWN_REPOSITORY_SECRETS.has(secret)) {
    throw new Error(`${name} must not use a repository-known secret in production`);
  }
  // Match Python/Go: Unicode-trimmed code points, ASCII letters/digits.
  const codePoints = Array.from(secret);
  if (codePoints.length < 32 || new Set(codePoints).size < 16 || !/[A-Za-z]/.test(secret) || !/[0-9]/.test(secret)) {
    throw new Error(`${name} must be a strong secret in production (32+ chars, letters, digits, and 16+ distinct chars)`);
  }
  return secret;
}

function requireProductionValue(name, value) {
  const configured = String(value || "").trim();
  if (isProduction && !configured) {
    throw new Error(`${name} must be explicitly configured in production`);
  }
  return configured;
}

const DEV_INTERNAL_CALL_SECRET = crypto.randomBytes(48).toString("base64url");
const INTERNAL_CALL_SECRET = requireStrongProductionSecret(
  "INTERNAL_CALL_SECRET",
  process.env.INTERNAL_CALL_SECRET || (isProduction ? "" : DEV_INTERNAL_CALL_SECRET),
);
const workerRegistrationSecret = requireStrongProductionSecret(
  "WORKER_REGISTRATION_SECRET",
  process.env.WORKER_REGISTRATION_SECRET || (isProduction ? "" : DEV_SECRET),
);
const vaultServerSecret = requireStrongProductionSecret(
  "VAULT_SERVER_SECRET",
  process.env.VAULT_SERVER_SECRET || (isProduction ? "" : DEV_SECRET),
);
const previewWebhookSecret = requireStrongProductionSecret(
  "PREVIEW_WEBHOOK_SECRET",
  process.env.PREVIEW_WEBHOOK_SECRET || (isProduction ? "" : DEV_SECRET),
);
const jwtSecret = requireStrongProductionSecret(
  "JWT_SECRET_KEY",
  process.env.JWT_SECRET_KEY || (isProduction ? "" : DEV_SECRET),
);
const globalSecretsEncryptionKey = requireStrongProductionSecret(
  "GLOBAL_SECRETS_ENCRYPTION_KEY",
  process.env.GLOBAL_SECRETS_ENCRYPTION_KEY || (isProduction ? "" : DEV_SECRET),
);
const databaseUrl = requireProductionValue("DATABASE_URL", process.env.DATABASE_URL);

module.exports = {
  apps: [
    {
      name: "radas-server",
      cwd: "./apps/server",
      script: ".venv/bin/python",
      args: "app.py",
      interpreter: "none",
      env: {
        ...process.env,
        PORT: SERVER_PORT,
        DATA_DIR: process.env.DATA_DIR || "./data",
        FLASK_ENV: childFlaskEnv,
        FLASK_DEBUG: childFlaskDebug,
        JWT_SECRET_KEY: jwtSecret,
        INTERNAL_CALL_SECRET,
        GLOBAL_SECRETS_ENCRYPTION_KEY: globalSecretsEncryptionKey,
        WORKER_REGISTRATION_SECRET: workerRegistrationSecret,
        VAULT_SERVER_SECRET: vaultServerSecret,
        PREVIEW_WEBHOOK_SECRET: previewWebhookSecret,
        ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || "",
        CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || "http://localhost:8080",
        DATABASE_URL: databaseUrl || "postgresql://localhost/radas",
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://localhost/radas_test",
      },
    },
    {
      name: "radas-console",
      cwd: "./apps/console",
      script: "./node_modules/vite/bin/vite.js",
      args: "dev --port 8080 --host 0.0.0.0",
      env: {
        VITE_API_TARGET: `http://localhost:${SERVER_PORT}`,
      },
    },
    {
      name: "radas-worker",
      cwd: "./apps/worker",
      script: "./bin/worker",
      args: "",
      env: {
        FLASK_ENV: childFlaskEnv,
        WORKER_NAME: "worker-go",
        WORKER_TAGS: "go",
        WORKER_SERVER_URL: `http://127.0.0.1:${SERVER_PORT}`,
        WORKER_TOKEN_FILE: "./data/worker.token",
        DATA_DIR: "./data",
        // Must exactly match the server's registration secret.
        WORKER_REGISTRATION_SECRET: workerRegistrationSecret,
        VAULT_SERVER_SECRET: vaultServerSecret,
        DATABASE_URL: databaseUrl || "postgresql://localhost/radas",
        JWT_SECRET_KEY: jwtSecret,
        INTERNAL_CALL_SECRET,
        GLOBAL_SECRETS_ENCRYPTION_KEY: globalSecretsEncryptionKey,
        WORKER_MAX_CONCURRENCY: "3",
        VAULT_SERVER_HOST: "127.0.0.1",
        VAULT_SERVER_PORT: "9998",
      },
    },
  ],
};
