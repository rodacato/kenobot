import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const engineRoot = join(fileURLToPath(import.meta.url), '..', '..', '..')

describe('install-service', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-service-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('uses dynamically resolved kenobot path in ExecStart', async () => {
    // Override homedir to use tmpDir so we can read the generated unit file
    const { homedir } = await import('node:os')
    const origHome = process.env.HOME
    process.env.HOME = tmpDir

    const paths = { engine: engineRoot }
    const { default: installService } = await import('../../src/cli/install-service.js')

    try {
      await installService([], paths)
    } catch {
      // systemctl will fail in test env, that's fine
    }

    process.env.HOME = origHome

    const unitFile = join(tmpDir, '.config', 'systemd', 'user', 'kenobot.service')
    const content = await readFile(unitFile, 'utf8')

    // Should NOT contain the old hardcoded path
    expect(content).not.toContain('%h/.kenobot/bin/kenobot')

    // Should contain ExecStart with a resolved path
    expect(content).toMatch(/ExecStart=\S+ start/)
  })
})
