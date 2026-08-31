# Desktop SQLite Boot Reliability Design

## Goal

Make the RADAS desktop app start reliably as a single Electron instance while
retaining SQLite through `better-sqlite3` for durable harness state.

## Root Cause

`better-sqlite3@13` ships platform prebuilds compiled for the workspace Node
runtime. Electron 34 uses a different native-module ABI. Although
`@electron/rebuild` creates an Electron-compatible addon under
`build/Release`, the package's default resolver prefers the incompatible
platform prebuild when it remains present. Loading that binary can block the
Electron main process during `new Database(...)`.

Several bootstrap details make the failure harder to recover from:

- `userData` is changed inside a bundled entry whose import ordering causes the
  change to run after the main module has initialized.
- Build output paths depend on the caller's current working directory.
- The bundled main process resolves the preload from the wrong directory.
- The window waits only for `ready-to-show`; when the development console and
  invalid file fallback both fail, the process stays alive without a visible
  window.

Repeated manual launches then look like many RADAS instances, even though some
processes are Electron helper processes and later app launches should be
rejected by the single-instance lock.

## Design

### SQLite native binding

SQLite remains the durable storage engine. Installation will run a repository
owned native rebuild command after dependency lifecycle scripts, targeting the
installed Electron version and rebuilding both `better-sqlite3` and `node-pty`.

When running under Electron, `PersistStore` will explicitly select
`better-sqlite3/build/Release/better_sqlite3.node`. Plain Node tests keep the
package's normal resolver and platform prebuild. This removes dependence on
renaming or deleting files inside `node_modules` while ensuring Electron never
selects a Node-ABI prebuild.

### Bootstrap ordering and single instance

The thin desktop entry will set the application name and isolated CTH
`userData` path before requiring `dist-cth/main.cjs`. The bundled CTH entry will
only load the main service module. The existing main-process
`requestSingleInstanceLock()` remains authoritative, so a second launch exits
and focuses the existing window instead of initializing another SQLite store.

### Deterministic build and runtime paths

The CTH build script will resolve inputs and outputs relative to its own
location, producing only `apps/desktop-app/dist-cth`. The BrowserWindow preload
will resolve to the root desktop `preload.js` from that bundle directory.

### Visible startup failure

The primary UI remains the console `/office` route. In development it loads
`CONSOLE_URL` or `http://localhost:8080/office`. In a packaged build it loads
the bundled console resource. If the selected UI cannot load, the existing
BrowserWindow will show a small local diagnostic page and remain visible. A
console outage must not resemble a hung or invisible app.

### Diagnostics

Temporary checkpoint logging will be removed. Durable startup errors will use
concise `console.error` messages that identify the failing subsystem without
including secrets.

## Verification

- A Node regression test verifies bootstrap ordering, deterministic build
  output, preload resolution, and Electron-specific SQLite binding selection.
- Desktop TypeScript type-check and CTH bundle build pass.
- An Electron SQLite smoke test opens an isolated temporary database, runs a
  query, closes it, and exits within a bounded timeout.
- A desktop launch reaches a visible window, and a second launch does not create
  another main application instance.
- Existing desktop ontology tests and production build pass.

## Non-goals

- Replacing SQLite or `better-sqlite3`.
- Recovering or deleting unrelated historical user databases automatically.
- Redesigning the desktop UI or changing the server database architecture.
