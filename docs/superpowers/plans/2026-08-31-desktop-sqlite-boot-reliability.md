# Desktop SQLite Boot Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RADAS start as one visible Electron instance while retaining SQLite through an Electron-compatible `better-sqlite3` addon.

**Architecture:** The thin CommonJS entry owns pre-bundle Electron initialization. The desktop pins the Node-20-compatible `better-sqlite3` v12 major; a postinstall rebuild creates Electron-native addons, and `PersistStore` explicitly selects that addon inside Electron. The CTH builder and BrowserWindow resolve paths from stable file locations, while failed console navigation produces a visible diagnostic surface.

**Tech Stack:** Electron 34, TypeScript 5.7, esbuild, `better-sqlite3` 12.11.1, `@electron/rebuild` 4, Node test runner.

## Global Constraints

- Keep SQLite and `better-sqlite3`; do not replace the durable store.
- Never delete or rewrite an existing user database automatically.
- Preserve `requestSingleInstanceLock()` as the application lock.
- Do not log secrets or database contents.
- Generated CTH bundles live only in `apps/desktop-app/dist-cth`.

---

### Task 1: Add boot regression contracts

**Files:**
- Create: `apps/desktop-app/test/boot-contract.test.cjs`
- Modify: `apps/desktop-app/package.json`

**Interfaces:**
- Consumes: desktop source files and package scripts.
- Produces: `pnpm test:boot`, a fast Node regression gate.

- [ ] **Step 1: Write the failing contract test**

Create a Node test which reads `main.js`, `cth/esbuild.mjs`,
`cth/main/db.ts`, and `cth/main/index.ts`. Assert that:

```js
assert.ok(main.indexOf('app.setPath') < main.indexOf('require("./dist-cth/main.cjs")'))
assert.match(pkg.scripts.postinstall, /electron-rebuild/)
assert.match(pkg.scripts.postinstall, /--build-from-source/)
assert.match(db, /nativeBinding/)
assert.match(db, /build.*Release.*better_sqlite3\.node/s)
assert.match(builder, /import\.meta\.url/)
assert.match(index, /join\(__dirname, '\.\.', 'preload\.js'\)/)
assert.doesNotMatch(index, /\[checkpoint\]|\[cw\]/)
```

- [ ] **Step 2: Verify RED**

Run: `cd apps/desktop-app && node --test test/boot-contract.test.cjs`

Expected: FAIL because bootstrap ordering, postinstall rebuilding, explicit
native binding, deterministic output paths, and cleaned diagnostics are absent.

- [ ] **Step 3: Add the test script**

Add `"test:boot": "node --test test/boot-contract.test.cjs"` to package scripts.

- [ ] **Step 4: Re-run to retain the expected RED state**

Run: `cd apps/desktop-app && pnpm test:boot`

Expected: the same intentional assertion failures, now reached through the
package script.

### Task 2: Make SQLite ABI selection deterministic

**Files:**
- Modify: `apps/desktop-app/package.json`
- Modify: `apps/desktop-app/cth/main/db.ts`
- Create: `apps/desktop-app/test/electron-sqlite-smoke.cjs`

**Interfaces:**
- Consumes: installed Electron version and `better-sqlite3` package root.
- Produces: Electron-specific `{ nativeBinding: string }` options and
  `pnpm test:sqlite-electron`.

- [ ] **Step 1: Add the native rebuild lifecycle**

Pin `better-sqlite3` to `^12.11.1`, whose engine range includes Electron 34's
embedded Node 20 runtime, and add these scripts:

```json
"native:rebuild": "electron-rebuild --force --build-from-source --which-module better-sqlite3,node-pty",
"postinstall": "pnpm native:rebuild"
```

- [ ] **Step 2: Select the rebuilt SQLite addon in Electron**

In `PersistStore.open()`, resolve `better-sqlite3/package.json`, construct
`build/Release/better_sqlite3.node`, and pass it as `nativeBinding` when
`process.versions.electron` exists. Under plain Node, construct `Database`
without this override.

- [ ] **Step 3: Add the Electron smoke app**

Create a bounded smoke entry that waits for `app.whenReady()`, opens a temporary
SQLite database using the rebuilt addon, executes `SELECT 1 AS ok`, verifies the
result, closes the database, removes only its own temporary directory, logs
`SQLITE_SMOKE_OK`, and exits zero. On error it logs a redacted error and exits
nonzero.

- [ ] **Step 4: Verify GREEN for the SQLite contract**

Run: `cd apps/desktop-app && pnpm native:rebuild`

Run: `cd apps/desktop-app && pnpm test:boot`

Run: `cd apps/desktop-app && pnpm test:sqlite-electron`

Expected: rebuild succeeds, the native-binding assertions pass, and the smoke
process prints `SQLITE_SMOKE_OK` without hanging.

### Task 3: Fix bootstrap and window paths

**Files:**
- Modify: `apps/desktop-app/main.js`
- Modify: `apps/desktop-app/cth/cth-entry.ts`
- Modify: `apps/desktop-app/cth/esbuild.mjs`
- Modify: `apps/desktop-app/cth/main/index.ts`
- Regenerate: `apps/desktop-app/dist-cth/main.cjs`
- Regenerate: `apps/desktop-app/dist-cth/preload.cjs`

**Interfaces:**
- Consumes: Electron `app`, the desktop directory, and optional `CONSOLE_URL`.
- Produces: ordered initialization, stable bundle/preload paths, and a visible
  BrowserWindow on both successful and failed console loads.

- [ ] **Step 1: Move pre-bundle setup into `main.js`**

Set the RADAS application name and append `-cth` to the initial `userData` path
before requiring `dist-cth/main.cjs`. Remove `app.setPath` from the bundled CTH
entry.

- [ ] **Step 2: Stabilize CTH build paths**

Use `fileURLToPath(import.meta.url)` and `dirname()` to compute the desktop root;
pass absolute entry points and output files to esbuild so invoking the script
from the repo root or desktop directory produces identical artifacts.

- [ ] **Step 3: Correct the BrowserWindow preload and visibility behavior**

Resolve the unified preload as `join(__dirname, '..', 'preload.js')`. Show the
window after successful content load and, on an unrecoverable navigation
failure, load a local encoded diagnostic document and show it. Preserve the
`/office` destination and `CONSOLE_URL` override.

- [ ] **Step 4: Remove temporary boot checkpoints**

Delete `[checkpoint]` and `[cw]` logs and restore normal formatting. Keep only
actionable subsystem errors such as `[db] open failed` and console-load errors.

- [ ] **Step 5: Build and verify the contracts**

Run: `cd apps/desktop-app && pnpm cth:build && pnpm test:boot`

Expected: bundles are written under `apps/desktop-app/dist-cth`, no nested
`cth/dist-cth` output is created, and all boot assertions pass.

### Task 4: Full verification and live single-instance check

**Files:**
- Modify: files from Tasks 1-3 only when their verification exposes a defect.
- Refresh: `graphify-out/`

**Interfaces:**
- Consumes: completed desktop boot implementation.
- Produces: verification evidence that the app opens and rejects a second main
  instance.

- [ ] **Step 1: Run static and unit verification**

Run: `cd apps/desktop-app && pnpm type-check`

Run: `cd apps/desktop-app && node --test ontology test/boot-contract.test.cjs`

Run: `cd apps/desktop-app && pnpm build`

Expected: all commands exit zero.

- [ ] **Step 2: Run the Electron SQLite smoke test**

Run: `cd apps/desktop-app && pnpm test:sqlite-electron`

Expected: bounded exit zero with `SQLITE_SMOKE_OK`.

- [ ] **Step 3: Run the desktop app and second-instance probe**

Start one Electron app with an isolated test `userData`, wait for the main
window boot marker, then launch a second copy. Verify only one Electron main
process retains the shared single-instance lock and that the first process
remains responsive. Terminate only the test-launched process afterward.

- [ ] **Step 4: Refresh and validate the repository graph**

Run: `graphify update .`

Run: `git diff --check`

Expected: graph header references the current source commit and the diff has no
whitespace errors.

- [ ] **Step 5: Review the final diff and commit**

Stage only the desktop boot fix, its tests, generated bundles, and refreshed
graph artifacts. Commit with:

```text
fix(desktop): make SQLite boot deterministic
```
