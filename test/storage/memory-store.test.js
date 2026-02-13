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

import MemoryStore from '../../src/storage/memory-store.js'

describe('MemoryStore', () => {
  let store
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-store-'))
    store = new MemoryStore(tmpDir)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('readLongTermMemory', () => {
    it('should return empty string when MEMORY.md does not exist', async () => {
      const result = await store.readLongTermMemory()
      expect(result).toBe('')
    })

    it('should read MEMORY.md content', async () => {
      const memDir = join(tmpDir, 'memory')
      await store._ensureDir()
      await writeFile(join(memDir, 'MEMORY.md'), '# Long-term facts\n- Fact 1', 'utf8')

      const result = await store.readLongTermMemory()
      expect(result).toContain('Long-term facts')
      expect(result).toContain('Fact 1')
    })
  })

  describe('appendDaily', () => {
    it('should append timestamped entry to daily file', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-13T15:45:00Z'))

      await store.appendDaily('Test fact')

      const content = await readFile(join(tmpDir, 'memory', '2026-02-13.md'), 'utf8')
      expect(content).toBe('## 15:45 — Test fact\n\n')
    })

    it('should create memory directory automatically', async () => {
      await store.appendDaily('auto-create test')

      const files = await readFile(join(tmpDir, 'memory', new Date().toISOString().slice(0, 10) + '.md'), 'utf8')
      expect(files).toContain('auto-create test')
    })
  })

  describe('getRecentDays', () => {
    it('should return empty string when no daily files exist', async () => {
      const result = await store.getRecentDays(3)
      expect(result).toBe('')
    })

    it('should return recent daily logs', async () => {
      const memDir = join(tmpDir, 'memory')
      await store._ensureDir()
      await writeFile(join(memDir, '2026-02-12.md'), '## 10:00 — yesterday\n')
      await writeFile(join(memDir, '2026-02-13.md'), '## 15:00 — today\n')

      const result = await store.getRecentDays(3)

      expect(result).toContain('2026-02-13')
      expect(result).toContain('today')
      expect(result).toContain('2026-02-12')
      expect(result).toContain('yesterday')
    })
  })

  describe('chat-specific memory', () => {
    it('should append to chat-specific daily log', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-13T16:00:00Z'))

      await store.appendChatDaily('telegram-123', 'Chat fact')

      const content = await readFile(join(tmpDir, 'memory', 'chats', 'telegram-123', '2026-02-13.md'), 'utf8')
      expect(content).toBe('## 16:00 — Chat fact\n\n')
    })

    it('should read chat long-term memory', async () => {
      const chatDir = join(tmpDir, 'memory', 'chats', 'telegram-123')
      await store._ensureDir()
      const { mkdir } = await import('node:fs/promises')
      await mkdir(chatDir, { recursive: true })
      await writeFile(join(chatDir, 'MEMORY.md'), '# Chat memory\n- Chat fact', 'utf8')

      const result = await store.getChatLongTermMemory('telegram-123')
      expect(result).toContain('Chat memory')
      expect(result).toContain('Chat fact')
    })
  })

  describe('working memory', () => {
    it('should write and read working memory', async () => {
      await store.writeWorkingMemory('telegram-123', 'Current task: debugging')

      const result = await store.getWorkingMemory('telegram-123')
      expect(result).not.toBeNull()
      expect(result.content).toBe('Current task: debugging')
      expect(result.updatedAt).toBeGreaterThan(0)
    })

    it('should return null when working memory does not exist', async () => {
      const result = await store.getWorkingMemory('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('compaction support', () => {
    it('should list daily logs', async () => {
      const memDir = join(tmpDir, 'memory')
      await store._ensureDir()
      await writeFile(join(memDir, '2026-02-11.md'), 'content')
      await writeFile(join(memDir, '2026-02-12.md'), 'content')
      await writeFile(join(memDir, 'MEMORY.md'), 'content')
      await writeFile(join(memDir, 'other.txt'), 'content')

      const logs = await store.listDailyLogs()

      expect(logs).toEqual(['2026-02-11.md', '2026-02-12.md'])
      expect(logs).not.toContain('MEMORY.md')
      expect(logs).not.toContain('other.txt')
    })
  })
})
