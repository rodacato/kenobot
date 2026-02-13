import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { homedir } from 'node:os'
import paths from '../../src/paths.js'

describe('paths', () => {
  it('resolves to ~/.kenobot by default', () => {
    const expected = join(homedir(), '.kenobot')
    expect(paths.home).toBe(expected)
    expect(paths.config).toBe(join(expected, 'config'))
    expect(paths.envFile).toBe(join(expected, 'config', '.env'))
    expect(paths.data).toBe(join(expected, 'data'))
    expect(paths.backups).toBe(join(expected, 'backups'))
    expect(paths.pidFile).toBe(join(expected, 'data', 'kenobot.pid'))
  })

  it('resolves engine root to project directory', () => {
    expect(paths.engine).toMatch(/kenobot$/)
    expect(paths.templates).toBe(join(paths.engine, 'templates'))
  })
})
