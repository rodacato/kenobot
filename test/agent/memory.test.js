import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// Suppress logger console output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../../src/logger.js'
import MemoryManager from '../../src/agent/memory.js'

describe('MemoryManager', () => {
  let manager
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-memory-'))
    manager = new MemoryManager(tmpDir)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('appendDaily', () => {
    it('should append timestamped entry to daily file', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:30:00Z'))

      await manager.appendDaily('User prefers Spanish')

      const content = await readFile(join(tmpDir, 'memory', '2026-02-07.md'), 'utf8')
      expect(content).toBe('## 10:30 — User prefers Spanish\n\n')
    })

    it('should use current date for filename', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-12-25T14:00:00Z'))

      await manager.appendDaily('Christmas note')

      const content = await readFile(join(tmpDir, 'memory', '2026-12-25.md'), 'utf8')
      expect(content).toContain('Christmas note')
    })

    it('should create memory directory automatically', async () => {
      await manager.appendDaily('test')

      const content = await readFile(join(tmpDir, 'memory', new Date().toISOString().slice(0, 10) + '.md'), 'utf8')
      expect(content).toContain('test')
    })

    it('should append multiple entries to the same daily file', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:00:00Z'))
      await manager.appendDaily('first fact')

      vi.setSystemTime(new Date('2026-02-07T14:30:00Z'))
      await manager.appendDaily('second fact')

      const content = await readFile(join(tmpDir, 'memory', '2026-02-07.md'), 'utf8')
      expect(content).toContain('## 10:00 — first fact')
      expect(content).toContain('## 14:30 — second fact')
    })
  })

  describe('getRecentDays', () => {
    it('should return empty string when no files exist', async () => {
      const result = await manager.getRecentDays(3)

      expect(result).toBe('')
    })

    it('should return content of recent daily files', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, '2026-02-06.md'), '## 09:00 — fact two\n')
      await writeFile(join(memDir, '2026-02-07.md'), '## 10:30 — fact one\n')

      const result = await manager.getRecentDays(3)

      expect(result).toContain('### 2026-02-07')
      expect(result).toContain('fact one')
      expect(result).toContain('### 2026-02-06')
      expect(result).toContain('fact two')
    })

    it('should return most recent days first', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, '2026-02-05.md'), 'content\n')
      await writeFile(join(memDir, '2026-02-06.md'), 'content\n')
      await writeFile(join(memDir, '2026-02-07.md'), 'content\n')

      const result = await manager.getRecentDays(3)

      const idx07 = result.indexOf('2026-02-07')
      const idx06 = result.indexOf('2026-02-06')
      const idx05 = result.indexOf('2026-02-05')
      expect(idx07).toBeLessThan(idx06)
      expect(idx06).toBeLessThan(idx05)
    })

    it('should limit to N days', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, '2026-02-04.md'), 'content\n')
      await writeFile(join(memDir, '2026-02-05.md'), 'content\n')
      await writeFile(join(memDir, '2026-02-06.md'), 'content\n')
      await writeFile(join(memDir, '2026-02-07.md'), 'content\n')

      const result = await manager.getRecentDays(2)

      expect(result).toContain('2026-02-07')
      expect(result).toContain('2026-02-06')
      expect(result).not.toContain('2026-02-05')
      expect(result).not.toContain('2026-02-04')
    })

    it('should exclude MEMORY.md from daily files', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, 'MEMORY.md'), 'long-term facts\n')
      await writeFile(join(memDir, '2026-02-07.md'), 'content\n')

      const result = await manager.getRecentDays(3)

      expect(result).not.toContain('### MEMORY')
      expect(result).toContain('### 2026-02-07')
    })

    it('should return empty string when memory directory does not exist', async () => {
      const badManager = new MemoryManager(join(tmpDir, 'nonexistent'))

      const result = await badManager.getRecentDays(3)

      expect(result).toBe('')
    })
  })

  describe('getLongTermMemory', () => {
    it('should return MEMORY.md content', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, 'MEMORY.md'), '# Long-term facts\n- User likes Star Wars')

      const result = await manager.getLongTermMemory()

      expect(result).toBe('# Long-term facts\n- User likes Star Wars')
    })

    it('should return empty string when MEMORY.md does not exist', async () => {
      const result = await manager.getLongTermMemory()

      expect(result).toBe('')
    })

    it('should log warning when MEMORY.md exceeds 10KB', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      const largeContent = 'x'.repeat(11000)
      await writeFile(join(memDir, 'MEMORY.md'), largeContent)

      const result = await manager.getLongTermMemory()

      expect(result).toBe(largeContent)
      expect(logger.warn).toHaveBeenCalledWith('memory', 'memory_file_large', expect.objectContaining({
        file: 'MEMORY.md',
        sizeBytes: 11000
      }))
    })

    it('should not log warning when MEMORY.md is under 10KB', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, 'MEMORY.md'), 'x'.repeat(5000))

      await manager.getLongTermMemory()

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('round-trip', () => {
    it('should write daily entries that getRecentDays can read back', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:30:00Z'))

      await manager.appendDaily('User prefers Spanish')
      await manager.appendDaily('User likes Star Wars')

      const result = await manager.getRecentDays(1)

      expect(result).toContain('User prefers Spanish')
      expect(result).toContain('User likes Star Wars')
      expect(result).toContain('### 2026-02-07')
    })
  })
})
