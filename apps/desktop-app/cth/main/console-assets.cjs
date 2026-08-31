'use strict'

const { existsSync, statSync } = require('node:fs')
const { extname, join, resolve, sep } = require('node:path')

function resolveConsoleAsset(consoleRoot, requestUrl) {
  const match = requestUrl.match(/^[a-z][a-z\d+.-]*:\/\/[^/]*(\/[^?#]*)?/i)
  if (!match) return { status: 400 }

  let pathname
  try {
    pathname = decodeURIComponent(match[1] || '/')
  } catch {
    return { status: 400 }
  }

  const candidate = resolve(consoleRoot, `.${pathname}`)
  if (candidate !== consoleRoot && !candidate.startsWith(`${consoleRoot}${sep}`)) {
    return { status: 403 }
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return { status: 200, filePath: candidate }
  }
  if (extname(pathname)) return { status: 404 }
  return { status: 200, filePath: join(consoleRoot, 'index.html') }
}

function startupDiagnosticHtml(isPackaged) {
  const guidance = isPackaged
    ? 'The bundled console assets are missing or invalid. Reinstall RADAS or rebuild the desktop package.'
    : 'Start the console on port 8080, or set CONSOLE_URL, then relaunch RADAS.'
  return `<!doctype html>
    <html><head><meta charset="utf-8"><title>RADAS startup</title></head>
    <body style="font:16px system-ui;padding:32px;background:#fff8e7;color:#29251f">
      <h1>RADAS could not load the console</h1>
      <p>${guidance}</p>
    </body></html>`
}

module.exports = { resolveConsoleAsset, startupDiagnosticHtml }
