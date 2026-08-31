// RADAS Desktop — main entry.
//
// The full munder-difflin main process (bundled to dist-cth/main.cjs) IS the
// app: it owns the office floor window, the agent harness (hive, node-pty
// PTYs running the claude CLI), the durable sqlite db, and the cth preload
// bridge. Its primary window loads the RADAS console at /office
// (CONSOLE_URL env overrides the dev default http://localhost:8080).
//
// The legacy RADAS main.js (pet window + console window + radasDesktop
// bridge) is preserved as main-radas-legacy.js.

const { app, protocol } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.setName("RADAS");
const configuredUserData = process.env.RADAS_USER_DATA_DIR?.trim();
const legacyUserData = path.join(app.getPath("appData"), "munder-difflin");
const radasUserData = path.join(app.getPath("appData"), "RADAS");
const radasHasState = ["harness.db", "config.json", "Local Storage"].some((name) =>
  fs.existsSync(path.join(radasUserData, name)),
);
if (configuredUserData) {
  app.setPath("userData", configuredUserData);
} else {
  // RADAS is the canonical app-data directory. Migrate the legacy directory
  // once so existing auth/session data survives without keeping the old name
  // as the active storage location.
  if (!radasHasState && fs.existsSync(legacyUserData)) {
    try {
      fs.cpSync(legacyUserData, radasUserData, { recursive: true });
    } catch (error) {
      console.error("[userData] legacy migration failed:", error);
    }
  }
  app.setPath("userData", radasUserData);
}

// Must be registered before app.ready. The handler itself is installed by the
// bundled main process once Electron is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "radas-console",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

require("./dist-cth/main.cjs");
