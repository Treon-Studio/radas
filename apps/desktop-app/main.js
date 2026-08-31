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

require("./dist-cth/main.cjs");
