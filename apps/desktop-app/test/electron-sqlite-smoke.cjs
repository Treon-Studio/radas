'use strict'

const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join } = require('node:path')

const smokeTimeoutMs = 20_000
const isElectronChild = process.env.RADAS_ELECTRON_SQLITE_CHILD === '1'

if (!isElectronChild) {
  const electron = require('electron')
  const child = spawn(electron, [__filename], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      RADAS_ELECTRON_SQLITE_CHILD: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    console.error('SQLITE_SMOKE_TIMEOUT')
    process.exitCode = 1
  }, smokeTimeoutMs)

  child.once('error', (error) => {
    clearTimeout(timer)
    console.error(`SQLITE_SMOKE_LAUNCH_FAILED: ${error.message}`)
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    clearTimeout(timer)
    process.stdout.write(output)
    if (code !== 0 || signal || !output.includes('SQLITE_SMOKE_OK')) {
      console.error(`SQLITE_SMOKE_FAILED: code=${code ?? 'null'} signal=${signal ?? 'none'}`)
      process.exitCode = 1
    }
  })
} else {
  const smokeDir = mkdtempSync(join(tmpdir(), 'radas-electron-sqlite-'))
  try {
    const Database = require('better-sqlite3')
    const packageJson = require.resolve('better-sqlite3/package.json')
    const nativeBinding = join(dirname(packageJson), 'build', 'Release', 'better_sqlite3.node')
    const db = new Database(join(smokeDir, 'smoke.db'), { nativeBinding })
    const row = db.prepare('SELECT 1 AS ok').get()
    db.close()
    if (row?.ok !== 1) throw new Error('unexpected SQLite query result')
    console.log('SQLITE_SMOKE_OK')
  } catch (error) {
    console.error(`SQLITE_SMOKE_ERROR: ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  } finally {
    rmSync(smokeDir, { recursive: true, force: true })
  }
}
