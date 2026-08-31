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

app.setName("RADAS");
const defaultUserData = app.getPath("userData");
const configuredUserData = process.env.RADAS_USER_DATA_DIR?.trim();
if (configuredUserData) {
  app.setPath("userData", configuredUserData);
} else if (!defaultUserData.endsWith("-cth")) {
  app.setPath("userData", `${defaultUserData}-cth`);
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
