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
const defaultUserData = app.getPath("userData");
const configuredUserData = process.env.RADAS_USER_DATA_DIR?.trim();
const legacyUserData = path.join(app.getPath("appData"), "munder-difflin");
const radasUserData = path.join(app.getPath("appData"), "RADAS");
if (configuredUserData) {
  app.setPath("userData", configuredUserData);
} else if (fs.existsSync(legacyUserData)) {
  // Preserve the existing Electron origin storage (including auth tokens and
  // refresh tokens) created by the original RADAS desktop build.
  app.setPath("userData", legacyUserData);
} else if (defaultUserData !== radasUserData) {
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
