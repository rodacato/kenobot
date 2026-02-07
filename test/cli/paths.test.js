import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { homedir } from 'node:os'

describe('paths', () => {
  let originalHome

  beforeEach(() => {
    originalHome = process.env.KENOBOT_HOME
    vi.resetModules()
  })

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.KENOBOT_HOME
    } else {
      process.env.KENOBOT_HOME = originalHome
    }
  })

  it('resolves to ~/.kenobot by default', async () => {
    delete process.env.KENOBOT_HOME
    const { default: paths } = await import('../../src/paths.js')
    const expected = join(homedir(), '.kenobot')
    expect(paths.home).toBe(expected)
    expect(paths.config).toBe(join(expected, 'config'))
    expect(paths.envFile).toBe(join(expected, 'config', '.env'))
    expect(paths.data).toBe(join(expected, 'data'))
    expect(paths.backups).toBe(join(expected, 'backups'))
    expect(paths.pidFile).toBe(join(expected, 'data', 'kenobot.pid'))
  })

  it('respects KENOBOT_HOME override', async () => {
    process.env.KENOBOT_HOME = '/tmp/test-kenobot'
    const { default: paths } = await import('../../src/paths.js')
    expect(paths.home).toBe('/tmp/test-kenobot')
    expect(paths.config).toBe('/tmp/test-kenobot/config')
    expect(paths.envFile).toBe('/tmp/test-kenobot/config/.env')
    expect(paths.identities).toBe('/tmp/test-kenobot/config/identities')
    expect(paths.skills).toBe('/tmp/test-kenobot/config/skills')
    expect(paths.data).toBe('/tmp/test-kenobot/data')
  })

  it('resolves engine root to project directory', async () => {
    const { default: paths } = await import('../../src/paths.js')
    expect(paths.engine).toMatch(/kenobot$/)
    expect(paths.templates).toBe(join(paths.engine, 'templates'))
  })
})
