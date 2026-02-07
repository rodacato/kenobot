import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, access, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
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
    data: join(home, 'data'),
    backups: join(home, 'backups'),
    pidFile: join(home, 'data', 'kenobot.pid'),
    templates: join(engineRoot, 'templates'),
  }
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function seedData(paths) {
  // Create runtime data directories with files
  await mkdir(join(paths.data, 'sessions'), { recursive: true })
  await mkdir(join(paths.data, 'memory'), { recursive: true })
  await mkdir(join(paths.data, 'logs'), { recursive: true })
  await mkdir(join(paths.data, 'scheduler'), { recursive: true })
  await mkdir(paths.backups, { recursive: true })
  await mkdir(paths.config, { recursive: true })

  await writeFile(join(paths.data, 'sessions', 'chat-123.jsonl'), '{"role":"user"}\n')
  await writeFile(join(paths.data, 'logs', 'kenobot-2025-01-01.log'), '{"level":"info"}\n')
  await writeFile(join(paths.data, 'scheduler', 'tasks.json'), '[]\n')
  await writeFile(join(paths.data, 'memory', 'MEMORY.md'), '# Bot Memory\nCustom content\n')
  await writeFile(join(paths.data, 'memory', '2025-01-01.md'), '## Daily log\n')
  await writeFile(paths.pidFile, '99999')
  await writeFile(join(paths.backups, 'kenobot-2025-01-01.tar.gz'), 'fake-backup')
  await writeFile(paths.envFile, 'TELEGRAM_BOT_TOKEN=secret\n')
}

describe('kenobot purge', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-purge-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('removes sessions, logs, scheduler, pid but preserves memory and config', async () => {
    const paths = makePaths(tmpDir)
    await seedData(paths)

    const { default: purge } = await import('../../src/cli/purge.js')
    await purge(['--yes', '--no-backup'], paths)

    // Removed
    expect(await exists(join(paths.data, 'sessions', 'chat-123.jsonl'))).toBe(false)
    expect(await exists(join(paths.data, 'logs', 'kenobot-2025-01-01.log'))).toBe(false)
    expect(await exists(join(paths.data, 'scheduler', 'tasks.json'))).toBe(false)
    expect(await exists(paths.pidFile)).toBe(false)

    // Directories recreated (empty)
    expect(await exists(join(paths.data, 'sessions'))).toBe(true)
    expect(await exists(join(paths.data, 'logs'))).toBe(true)

    // Preserved
    expect(await exists(join(paths.data, 'memory', 'MEMORY.md'))).toBe(true)
    expect(await exists(join(paths.data, 'memory', '2025-01-01.md'))).toBe(true)
    expect(await exists(paths.backups)).toBe(true)
    expect(await exists(paths.envFile)).toBe(true)
    const mem = await readFile(join(paths.data, 'memory', 'MEMORY.md'), 'utf8')
    expect(mem).toContain('Custom content')
  })

  it('--memory also clears memory and restores template', async () => {
    const paths = makePaths(tmpDir)
    await seedData(paths)

    const { default: purge } = await import('../../src/cli/purge.js')
    await purge(['--memory', '--yes', '--no-backup'], paths)

    // Memory dir recreated
    expect(await exists(join(paths.data, 'memory'))).toBe(true)
    // Daily logs gone
    expect(await exists(join(paths.data, 'memory', '2025-01-01.md'))).toBe(false)
    // MEMORY.md restored from template (not the custom content)
    const mem = await readFile(join(paths.data, 'memory', 'MEMORY.md'), 'utf8')
    expect(mem).not.toContain('Custom content')

    // Config preserved
    expect(await exists(paths.envFile)).toBe(true)
    // Backups preserved
    expect(await exists(join(paths.backups, 'kenobot-2025-01-01.tar.gz'))).toBe(true)
  })

  it('--all also clears backups', async () => {
    const paths = makePaths(tmpDir)
    await seedData(paths)

    const { default: purge } = await import('../../src/cli/purge.js')
    await purge(['--all', '--yes', '--no-backup'], paths)

    // Backups gone
    expect(await exists(paths.backups)).toBe(false)

    // Config still preserved
    expect(await exists(paths.envFile)).toBe(true)
  })

  it('reports nothing to purge when data dir is empty', async () => {
    const paths = makePaths(tmpDir)
    await mkdir(paths.data, { recursive: true })

    const { default: purge } = await import('../../src/cli/purge.js')
    // Should not throw
    await purge(['--yes', '--no-backup'], paths)
  })

  it('refuses to purge if bot is running', async () => {
    const paths = makePaths(tmpDir)
    await seedData(paths)

    // Write our own PID so checkPid thinks the bot is running
    await writeFile(paths.pidFile, String(process.pid))

    const { default: purge } = await import('../../src/cli/purge.js')

    // Should call process.exit(1)
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    await expect(purge(['--yes', '--no-backup'], paths)).rejects.toThrow('process.exit')
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })
})
