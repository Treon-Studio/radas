'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const desktopRoot = join(__dirname, '..')
const read = (relativePath) => readFileSync(join(desktopRoot, relativePath), 'utf8')

test('configures Electron before loading the bundled main process', () => {
  const main = read('main.js')
  const setPathAt = main.indexOf('app.setPath')
  const loadBundleAt = main.indexOf('require("./dist-cth/main.cjs")')

  assert.notEqual(setPathAt, -1, 'main.js must set an isolated userData path')
  assert.notEqual(loadBundleAt, -1, 'main.js must load the CTH main bundle')
  assert.ok(setPathAt < loadBundleAt, 'userData must be set before the CTH bundle loads')
  assert.match(main, /process\.env\.RADAS_USER_DATA_DIR/)
  assert.match(main, /join\(app\.getPath\("appData"\), "munder-difflin"\)/)
  assert.match(main, /cpSync\(legacyUserData, radasUserData/)
  assert.match(main, /radasHasState/)
  assert.match(main, /app\.setPath\("userData", radasUserData\)/)
  assert.doesNotMatch(main, /app\.setPath\("userData", legacyUserData\)/)
})

test('rebuilds native dependencies for Electron after install', () => {
  const pkg = JSON.parse(read('package.json'))
  const workspace = read('../../pnpm-workspace.yaml')
  const releaseWorkflow = read('../../.github/workflows/desktop-release.yml')

  assert.match(workspace, /^\s*electron:\s*true$/m)
  assert.match(pkg.scripts.postinstall, /electron-rebuild/)
  assert.match(pkg.scripts.postinstall, /--build-from-source/)
  assert.match(pkg.scripts.postinstall, /better-sqlite3/)
  assert.match(pkg.scripts.postinstall, /node-pty/)
  assert.match(pkg.scripts['console:build'], /@radas\/console build/)
  assert.match(pkg.scripts.dist, /console:build/)
  assert.match(pkg.scripts['electron:dev'], /cth:build/)
  assert.match(pkg.scripts.dist, /cth:build/)
  assert.match(pkg.scripts['dist:mac'], /cth:build/)
  assert.match(pkg.scripts['dist:linux'], /cth:build/)
  assert.match(pkg.scripts['dist:win'], /cth:build/)
  assert.match(releaseWorkflow, /pnpm cth:build[\s\S]*electron-builder/)
})

test('forces the Electron-compatible better-sqlite3 binding', () => {
  const db = read('cth/main/db.ts')

  assert.match(db, /process\.versions\.electron/)
  assert.match(db, /nativeBinding/)
  assert.match(db, /build[\s\S]*Release[\s\S]*better_sqlite3\.node/)
})

test('build and runtime paths do not depend on the caller directory', () => {
  const builder = read('cth/esbuild.mjs')
  const main = read('cth/main/index.ts')

  assert.match(builder, /import\.meta\.url/)
  assert.match(main, /join\(__dirname, '\.\.', 'preload\.js'\)/)
})

test('temporary boot checkpoints are absent', () => {
  const main = read('cth/main/index.ts')

  assert.doesNotMatch(main, /\[checkpoint\]|\[cw\]/)
})

test('window boot supports packaged console assets and a visible failure page', () => {
  const bootstrap = read('main.js')
  const main = read('cth/main/index.ts')

  assert.match(bootstrap, /registerSchemesAsPrivileged/)
  assert.match(main, /protocol\.handle\('radas-console'/)
  assert.match(main, /radas-console:\/\/app\/office/)
  assert.match(main, /data:text\/html/)
  assert.match(main, /app\.isPackaged && !process\.defaultApp/)
  assert.match(main, /childElementCount/)
})

test('registers updater IPC in development without starting packaged polling', () => {
  const main = read('cth/main/index.ts')
  const updater = read('cth/main/updater.ts')

  assert.doesNotMatch(main, /if \(isPackagedRuntime\) initAutoUpdater/)
  assert.match(main, /initAutoUpdater\(\(\) => liveWebContents\(\)\)/)
  assert.match(updater, /if \(!app\.isPackaged\) return;/)
})

test('boots the RADAS pet companion and tray alongside the console', () => {
  const main = read('cth/main/index.ts')
  const css = read('src/index.css')

  assert.match(main, /Tray/)
  assert.match(main, /new Tray/)
  assert.match(main, /function createPetWindow/)
  assert.match(main, /RADAS Pet/)
  assert.match(main, /createPetWindow\(\)/)
  assert.match(main, /title: isFloor \? 'RADAS — Floor' : 'RADAS'/)
  assert.match(main, /backgroundColor: '#00000000'/)
  assert.match(css, /html,\s*body,\s*#root[\s\S]*background-color:\s*transparent/)
})
