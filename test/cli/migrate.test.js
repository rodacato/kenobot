import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, access, readFile } from 'node:fs/promises'
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

async function createOldLayout(dir) {
  await mkdir(join(dir, 'src'), { recursive: true })
  await mkdir(join(dir, 'identities'), { recursive: true })
  await mkdir(join(dir, 'skills', 'weather'), { recursive: true })
  await mkdir(join(dir, 'data', 'sessions'), { recursive: true })
  await mkdir(join(dir, 'data', 'memory'), { recursive: true })
  await writeFile(join(dir, '.env'), 'TELEGRAM_BOT_TOKEN=test123\n')
  await writeFile(join(dir, 'identities', 'kenobot.md'), '# Custom Identity\n')
  await writeFile(join(dir, 'skills', 'weather', 'manifest.json'), '{"name":"weather"}\n')
  await writeFile(join(dir, 'data', 'sessions', 'chat-1.jsonl'), '{"msg":"hello"}\n')
  await writeFile(join(dir, 'data', 'memory', 'MEMORY.md'), '# My Memory\n')
}

describe('kenobot migrate', () => {
  let tmpDir, sourceDir, targetDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-migrate-'))
    sourceDir = join(tmpDir, 'old-kenobot')
    targetDir = join(tmpDir, 'new-home')
    await mkdir(sourceDir, { recursive: true })
    await mkdir(targetDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('copies user files from old layout to new home', async () => {
    await createOldLayout(sourceDir)
    const paths = makePaths(targetDir)
    const { default: migrate } = await import('../../src/cli/migrate.js')
    await migrate([sourceDir], paths)

    // Config files migrated
    expect(await exists(paths.envFile)).toBe(true)
    const envContent = await readFile(paths.envFile, 'utf8')
    expect(envContent).toContain('test123')

    // Identity migrated
    const identity = await readFile(join(paths.identities, 'kenobot.md'), 'utf8')
    expect(identity).toContain('Custom Identity')

    // Skills migrated
    expect(await exists(join(paths.skills, 'weather', 'manifest.json'))).toBe(true)

    // Data migrated
    expect(await exists(join(paths.data, 'sessions', 'chat-1.jsonl'))).toBe(true)
    expect(await exists(join(paths.data, 'memory', 'MEMORY.md'))).toBe(true)
  })

  it('does not overwrite existing files in target', async () => {
    await createOldLayout(sourceDir)
    const paths = makePaths(targetDir)

    // Pre-create target with different content
    await mkdir(join(paths.config), { recursive: true })
    await writeFile(paths.envFile, 'EXISTING=true\n')

    const { default: migrate } = await import('../../src/cli/migrate.js')
    await migrate([sourceDir], paths)

    // Should keep existing content
    const envContent = await readFile(paths.envFile, 'utf8')
    expect(envContent).toBe('EXISTING=true\n')
  })

  it('does not modify source directory', async () => {
    await createOldLayout(sourceDir)
    const paths = makePaths(targetDir)
    const { default: migrate } = await import('../../src/cli/migrate.js')
    await migrate([sourceDir], paths)

    // Source still intact
    expect(await exists(join(sourceDir, '.env'))).toBe(true)
    expect(await exists(join(sourceDir, 'identities', 'kenobot.md'))).toBe(true)
  })

  it('rejects non-kenobot directories', async () => {
    const randomDir = join(tmpDir, 'random')
    await mkdir(randomDir, { recursive: true })
    await writeFile(join(randomDir, 'file.txt'), 'not kenobot\n')

    const paths = makePaths(targetDir)
    const { default: migrate } = await import('../../src/cli/migrate.js')

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    try {
      await migrate([randomDir], paths)
    } catch { /* expected */ }
    expect(mockExit).toHaveBeenCalledWith(1)
    mockExit.mockRestore()
  })
})
