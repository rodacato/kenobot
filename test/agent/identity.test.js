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
  let identityDir

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kenobot-identity-'))
    identityDir = join(tempDir, 'kenobot')
    await mkdir(identityDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('load', () => {
    it('should load SOUL.md and IDENTITY.md from directory', async () => {
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul\nI am friendly.')
      await writeFile(join(identityDir, 'IDENTITY.md'), '# Identity\nExpert in Node.js.')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(loader.getSoul()).toBe('# Soul\nI am friendly.')
      expect(loader.getIdentity()).toBe('# Identity\nExpert in Node.js.')
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

    it('should handle missing directory gracefully', async () => {
      const loader = new IdentityLoader(join(tempDir, 'nonexistent'))
      await loader.load()

      expect(loader.getSoul()).toBe('')
      expect(loader.getIdentity()).toBe('')
    })
  })

  describe('getUser', () => {
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
  })

  describe('reload', () => {
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
    beforeEach(async () => {
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
  })

  describe('getBootstrap', () => {
    beforeEach(async () => {
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul')
    })

    it('should return BOOTSTRAP.md content when file exists', async () => {
      await writeFile(join(identityDir, 'BOOTSTRAP.md'), '# Hey, I just came online.')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(await loader.getBootstrap()).toBe('# Hey, I just came online.')
    })

    it('should return null when BOOTSTRAP.md does not exist', async () => {
      const loader = new IdentityLoader(identityDir)
      await loader.load()

      expect(await loader.getBootstrap()).toBeNull()
    })
  })

  describe('deleteBootstrap', () => {
    beforeEach(async () => {
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul')
    })

    it('should delete BOOTSTRAP.md file', async () => {
      await writeFile(join(identityDir, 'BOOTSTRAP.md'), '# Bootstrap content')

      const loader = new IdentityLoader(identityDir)
      await loader.load()

      // Verify it exists first
      expect(await loader.getBootstrap()).toBe('# Bootstrap content')

      await loader.deleteBootstrap()

      // Verify it's gone
      expect(await loader.getBootstrap()).toBeNull()
    })

    it('should not throw if BOOTSTRAP.md already missing', async () => {
      const loader = new IdentityLoader(identityDir)
      await loader.load()

      await expect(loader.deleteBootstrap()).resolves.not.toThrow()
    })
  })
})
