import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// Suppress logger console output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import IdentityLoader from '../../src/agent/identity.js'

describe('IdentityLoader', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kenobot-identity-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('file mode (backwards compat)', () => {
    it('should load a single file as soul', async () => {
      const filePath = join(tempDir, 'kenobot.md')
      await writeFile(filePath, '# KenoBot\nI am KenoBot.')

      const loader = new IdentityLoader(filePath)
      await loader.load()

      expect(loader.getSoul()).toBe('# KenoBot\nI am KenoBot.')
      expect(loader.getIdentity()).toBe('')
    })

    it('should return empty user in file mode', async () => {
      const filePath = join(tempDir, 'kenobot.md')
      await writeFile(filePath, '# KenoBot')

      const loader = new IdentityLoader(filePath)
      await loader.load()

      expect(await loader.getUser()).toBe('')
    })

    it('should handle missing file gracefully', async () => {
      const loader = new IdentityLoader(join(tempDir, 'nonexistent.md'))
      await loader.load()

      expect(loader.getSoul()).toBe('')
      expect(loader.getIdentity()).toBe('')
    })

    it('should reload file content', async () => {
      const filePath = join(tempDir, 'kenobot.md')
      await writeFile(filePath, 'Original content')

      const loader = new IdentityLoader(filePath)
      await loader.load()
      expect(loader.getSoul()).toBe('Original content')

      await writeFile(filePath, 'Updated content')
      await loader.reload()
      expect(loader.getSoul()).toBe('Updated content')
    })
  })

  describe('directory mode', () => {
    let identityDir

    beforeEach(async () => {
      identityDir = join(tempDir, 'kenobot')
      await mkdir(identityDir, { recursive: true })
    })

    it('should load SOUL.md and IDENTITY.md from directory', async () => {
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul\nI am friendly.')
      await writeFile(join(identityDir, 'IDENTITY.md'), '# Identity\nExpert in Node.js.')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(loader.getSoul()).toBe('# Soul\nI am friendly.')
      expect(loader.getIdentity()).toBe('# Identity\nExpert in Node.js.')
    })

    it('should load USER.md fresh each call', async () => {
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul')
      await writeFile(join(identityDir, 'USER.md'), '# User\n- Name: Carlos')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(await loader.getUser()).toBe('# User\n- Name: Carlos')

      // Modify USER.md — should be reflected immediately
      await writeFile(join(identityDir, 'USER.md'), '# User\n- Name: Carlos\n- Timezone: UTC-6')

      expect(await loader.getUser()).toContain('Timezone: UTC-6')
    })

    it('should return empty string for missing USER.md', async () => {
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(await loader.getUser()).toBe('')
    })

    it('should handle missing SOUL.md gracefully', async () => {
      await writeFile(join(identityDir, 'IDENTITY.md'), '# Identity')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(loader.getSoul()).toBe('')
      expect(loader.getIdentity()).toBe('# Identity')
    })

    it('should handle missing IDENTITY.md gracefully', async () => {
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(loader.getSoul()).toBe('# Soul')
      expect(loader.getIdentity()).toBe('')
    })

    it('should reload SOUL.md and IDENTITY.md', async () => {
      await writeFile(join(identityDir, 'SOUL.md'), 'Original soul')
      await writeFile(join(identityDir, 'IDENTITY.md'), 'Original identity')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      await writeFile(join(identityDir, 'SOUL.md'), 'Updated soul')
      await loader.reload()

      expect(loader.getSoul()).toBe('Updated soul')
      expect(loader.getIdentity()).toBe('Original identity')
    })
  })

  describe('appendUser', () => {
    let identityDir

    beforeEach(async () => {
      identityDir = join(tempDir, 'kenobot')
      await mkdir(identityDir, { recursive: true })
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul')
    })

    it('should append to existing Learned Preferences section', async () => {
      await writeFile(join(identityDir, 'USER.md'), '# User\n\n## Learned Preferences\n- Name: Carlos\n')

      const loader = new IdentityLoader(identityDir)
      await loader.load()
      await loader.appendUser(['Timezone: UTC-6'])

      const content = await readFile(join(identityDir, 'USER.md'), 'utf8')
      expect(content).toContain('- Timezone: UTC-6')
      expect(content).toContain('- Name: Carlos')
    })

    it('should create Learned Preferences section if missing', async () => {
      await writeFile(join(identityDir, 'USER.md'), '# User\n')

      const loader = new IdentityLoader(identityDir)
      await loader.load()
      await loader.appendUser(['Preferred language: Spanish'])

      const content = await readFile(join(identityDir, 'USER.md'), 'utf8')
      expect(content).toContain('## Learned Preferences')
      expect(content).toContain('- Preferred language: Spanish')
    })

    it('should create USER.md if it does not exist', async () => {
      const loader = new IdentityLoader(identityDir)
      await loader.load()
      await loader.appendUser(['First preference'])

      const content = await readFile(join(identityDir, 'USER.md'), 'utf8')
      expect(content).toContain('## Learned Preferences')
      expect(content).toContain('- First preference')
    })

    it('should append multiple entries at once', async () => {
      await writeFile(join(identityDir, 'USER.md'), '# User\n\n## Learned Preferences\n')

      const loader = new IdentityLoader(identityDir)
      await loader.load()
      await loader.appendUser(['Timezone: UTC-6', 'Language: Spanish'])

      const content = await readFile(join(identityDir, 'USER.md'), 'utf8')
      expect(content).toContain('- Timezone: UTC-6')
      expect(content).toContain('- Language: Spanish')
    })

    it('should no-op when entries array is empty', async () => {
      await writeFile(join(identityDir, 'USER.md'), '# User\nOriginal')

      const loader = new IdentityLoader(identityDir)
      await loader.load()
      await loader.appendUser([])

      const content = await readFile(join(identityDir, 'USER.md'), 'utf8')
      expect(content).toBe('# User\nOriginal')
    })

    it('should no-op in file mode', async () => {
      const filePath = join(tempDir, 'single.md')
      await writeFile(filePath, '# KenoBot')

      const loader = new IdentityLoader(filePath)
      await loader.load()
      await loader.appendUser(['Should not be saved'])

      // No USER.md should be created
      const content = await readFile(filePath, 'utf8')
      expect(content).toBe('# KenoBot')
    })
  })

  describe('fallback detection', () => {
    it('should fall back to .md file when directory path does not exist', async () => {
      // Create kenobot.md but not kenobot/ directory
      const mdPath = join(tempDir, 'kenobot.md')
      await writeFile(mdPath, '# Fallback content')

      // Pass directory path (without .md)
      const loader = new IdentityLoader(join(tempDir, 'kenobot'))
      await loader.load()

      expect(loader.getSoul()).toBe('# Fallback content')
    })
  })
})
