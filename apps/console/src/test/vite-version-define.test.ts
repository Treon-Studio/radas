import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('console build constants', () => {
  it('defines an app version for the vendored office renderer', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(config).toMatch(/define:\s*\{[\s\S]*__APP_VERSION__:/)
  })
})
