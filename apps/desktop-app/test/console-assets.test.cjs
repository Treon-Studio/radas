'use strict'

const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const test = require('node:test')

const { resolveConsoleAsset, startupDiagnosticHtml } = require('../cth/main/console-assets.cjs')

test('serves existing console assets and SPA routes without masking missing assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'radas-console-assets-'))
  try {
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'index.html'), '<html>app</html>')
    writeFileSync(join(root, 'assets', 'app.js'), 'export {}')

    assert.deepEqual(resolveConsoleAsset(root, 'radas-console://app/assets/app.js'), {
      status: 200,
      filePath: join(root, 'assets', 'app.js'),
    })
    assert.deepEqual(resolveConsoleAsset(root, 'radas-console://app/office'), {
      status: 200,
      filePath: join(root, 'index.html'),
    })
    assert.deepEqual(resolveConsoleAsset(root, 'radas-console://app/assets/missing.js'), {
      status: 404,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects traversal and malformed console paths', () => {
  const root = join(tmpdir(), 'radas-console-root')

  assert.deepEqual(resolveConsoleAsset(root, 'radas-console://app/%2e%2e/secret.txt'), { status: 403 })
  assert.deepEqual(resolveConsoleAsset(root, 'radas-console://app/%E0%A4%A'), { status: 400 })
})

test('startup diagnostics distinguish packaged and development failures', () => {
  const packaged = startupDiagnosticHtml(true)
  const development = startupDiagnosticHtml(false)

  assert.match(packaged, /bundled console/i)
  assert.doesNotMatch(packaged, /port 8080/i)
  assert.match(development, /port 8080/i)
})
