import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const engineRoot = join(fileURLToPath(import.meta.url), '..', '..', '..')

function makePaths(home) {
  return {
    home,
    engine: engineRoot,
    config: join(home, 'config'),
    envFile: join(home, 'config', '.env'),
    identities: join(home, 'config', 'identities'),
    skills: join(home, 'config', 'skills'),
    tools: join(home, 'config', 'tools'),
    data: join(home, 'data'),
    backups: join(home, 'backups'),
    pidFile: join(home, 'data', 'kenobot.pid'),
    templates: join(engineRoot, 'templates'),
  }
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

describe('kenobot init', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('creates all directories and copies templates', async () => {
    const paths = makePaths(tmpDir)
    const { default: init } = await import('../../src/cli/init.js')
    await init([], paths)

    // Directories exist
    expect(await exists(paths.config)).toBe(true)
    expect(await exists(paths.identities)).toBe(true)
    expect(await exists(paths.skills)).toBe(true)
    expect(await exists(paths.data)).toBe(true)
    expect(await exists(join(paths.data, 'sessions'))).toBe(true)
    expect(await exists(join(paths.data, 'memory'))).toBe(true)
    expect(await exists(join(paths.data, 'logs'))).toBe(true)
    expect(await exists(paths.backups)).toBe(true)

    // Template files copied
    expect(await exists(paths.envFile)).toBe(true)
    expect(await exists(join(paths.identities, 'kenobot', 'SOUL.md'))).toBe(true)
    expect(await exists(join(paths.identities, 'kenobot', 'BOOTSTRAP.md'))).toBe(true)
    expect(await exists(join(paths.skills, 'weather', 'manifest.json'))).toBe(true)
    expect(await exists(join(paths.skills, 'daily-summary', 'manifest.json'))).toBe(true)
    expect(await exists(join(paths.data, 'memory', 'MEMORY.md'))).toBe(true)

    // .env has expected content
    const envContent = await readFile(paths.envFile, 'utf8')
    expect(envContent).toContain('TELEGRAM_BOT_TOKEN')
  })

  it('does not overwrite existing files on re-run', async () => {
    const paths = makePaths(tmpDir)
    const { default: init } = await import('../../src/cli/init.js')

    // First run
    await init([], paths)

    // Modify the .env file
    const { writeFile } = await import('node:fs/promises')
    await writeFile(paths.envFile, 'CUSTOM=true\n')

    // Second run
    await init([], paths)

    // .env should still have the custom content
    const envContent = await readFile(paths.envFile, 'utf8')
    expect(envContent).toBe('CUSTOM=true\n')
  })

  it('restores missing files inside existing directories', async () => {
    const paths = makePaths(tmpDir)
    const { default: init } = await import('../../src/cli/init.js')

    // First run — full install
    await init([], paths)

    // Delete individual files (simulates corruption or purge --all + partial state)
    const { rm: rmFile, writeFile } = await import('node:fs/promises')
    await rmFile(join(paths.identities, 'kenobot', 'BOOTSTRAP.md'))
    await rmFile(join(paths.identities, 'kenobot', 'USER.md'))
    await rmFile(join(paths.skills, 'weather', 'SKILL.md'))
    await rmFile(join(paths.data, 'memory', 'MEMORY.md'))

    // Modify SOUL.md to verify it's NOT overwritten
    await writeFile(join(paths.identities, 'kenobot', 'SOUL.md'), 'CUSTOM SOUL')

    // Second run — should restore missing files
    await init([], paths)

    // Missing files restored
    expect(await exists(join(paths.identities, 'kenobot', 'BOOTSTRAP.md'))).toBe(true)
    expect(await exists(join(paths.identities, 'kenobot', 'USER.md'))).toBe(true)
    expect(await exists(join(paths.skills, 'weather', 'SKILL.md'))).toBe(true)
    expect(await exists(join(paths.data, 'memory', 'MEMORY.md'))).toBe(true)

    // Existing files NOT overwritten
    const soulContent = await readFile(join(paths.identities, 'kenobot', 'SOUL.md'), 'utf8')
    expect(soulContent).toBe('CUSTOM SOUL')
  })
})
