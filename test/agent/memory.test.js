import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
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
import FileMemory from '../../src/agent/memory.js'

describe('FileMemory', () => {
  let manager
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-memory-'))
    manager = new FileMemory(tmpDir)
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
      const badManager = new FileMemory(join(tmpDir, 'nonexistent'))

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

  describe('appendChatDaily', () => {
    it('should write to chat-scoped directory', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:30:00Z'))

      await manager.appendChatDaily('telegram-123', 'Chat-specific fact')

      const content = await readFile(
        join(tmpDir, 'memory', 'chats', 'telegram-123', '2026-02-07.md'), 'utf8'
      )
      expect(content).toBe('## 10:30 — Chat-specific fact\n\n')
    })

    it('should auto-create chat directory', async () => {
      await manager.appendChatDaily('telegram-999', 'test')

      const content = await readFile(
        join(tmpDir, 'memory', 'chats', 'telegram-999',
          new Date().toISOString().slice(0, 10) + '.md'), 'utf8'
      )
      expect(content).toContain('test')
    })

    it('should handle negative chat IDs (groups)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T12:00:00Z'))

      await manager.appendChatDaily('telegram--1001234567890', 'Group fact')

      const content = await readFile(
        join(tmpDir, 'memory', 'chats', 'telegram--1001234567890', '2026-02-07.md'), 'utf8'
      )
      expect(content).toContain('Group fact')
    })

    it('should not affect global daily logs', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:30:00Z'))

      await manager.appendChatDaily('telegram-123', 'chat-only fact')

      const globalResult = await manager.getRecentDays(1)
      expect(globalResult).toBe('')
    })
  })

  describe('getChatRecentDays', () => {
    it('should return empty string when chat directory does not exist', async () => {
      const result = await manager.getChatRecentDays('telegram-nonexistent', 3)
      expect(result).toBe('')
    })

    it('should read from chat-scoped directory', async () => {
      const chatDir = join(tmpDir, 'memory', 'chats', 'telegram-123')
      await mkdir(chatDir, { recursive: true })
      await writeFile(join(chatDir, '2026-02-07.md'), '## 10:30 — chat fact\n')

      const result = await manager.getChatRecentDays('telegram-123', 3)

      expect(result).toContain('### 2026-02-07')
      expect(result).toContain('chat fact')
    })

    it('should not include global daily logs', async () => {
      // Write global log
      await manager._ensureDir()
      await writeFile(join(tmpDir, 'memory', '2026-02-07.md'), '## 10:00 — global fact\n')

      // Write chat log
      const chatDir = join(tmpDir, 'memory', 'chats', 'telegram-123')
      await mkdir(chatDir, { recursive: true })
      await writeFile(join(chatDir, '2026-02-07.md'), '## 11:00 — chat fact\n')

      const chatResult = await manager.getChatRecentDays('telegram-123', 3)
      const globalResult = await manager.getRecentDays(3)

      expect(chatResult).toContain('chat fact')
      expect(chatResult).not.toContain('global fact')
      expect(globalResult).toContain('global fact')
      expect(globalResult).not.toContain('chat fact')
    })
  })

  describe('getChatLongTermMemory', () => {
    it('should return empty string when chat MEMORY.md does not exist', async () => {
      const result = await manager.getChatLongTermMemory('telegram-123')
      expect(result).toBe('')
    })

    it('should read chat-specific MEMORY.md', async () => {
      const chatDir = join(tmpDir, 'memory', 'chats', 'telegram-123')
      await mkdir(chatDir, { recursive: true })
      await writeFile(join(chatDir, 'MEMORY.md'), '# Chat Memory\n- Family in Madrid')

      const result = await manager.getChatLongTermMemory('telegram-123')

      expect(result).toBe('# Chat Memory\n- Family in Madrid')
    })
  })

  describe('chat memory round-trip', () => {
    it('should write chat entries that getChatRecentDays can read back', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:30:00Z'))

      await manager.appendChatDaily('telegram-123', 'Chat fact one')
      await manager.appendChatDaily('telegram-123', 'Chat fact two')

      const result = await manager.getChatRecentDays('telegram-123', 1)

      expect(result).toContain('Chat fact one')
      expect(result).toContain('Chat fact two')
      expect(result).toContain('### 2026-02-07')
    })

    it('should isolate memory between different chats', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:30:00Z'))

      await manager.appendChatDaily('telegram-123', 'DM fact')
      await manager.appendChatDaily('telegram--100999', 'Group fact')

      const dmResult = await manager.getChatRecentDays('telegram-123', 1)
      const groupResult = await manager.getChatRecentDays('telegram--100999', 1)

      expect(dmResult).toContain('DM fact')
      expect(dmResult).not.toContain('Group fact')
      expect(groupResult).toContain('Group fact')
      expect(groupResult).not.toContain('DM fact')
    })
  })

  describe('listDailyLogs', () => {
    it('should list daily log files sorted', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, '2026-02-07.md'), 'content\n')
      await writeFile(join(memDir, '2026-01-15.md'), 'content\n')
      await writeFile(join(memDir, '2026-02-06.md'), 'content\n')

      const result = await manager.listDailyLogs()

      expect(result).toEqual(['2026-01-15.md', '2026-02-06.md', '2026-02-07.md'])
    })

    it('should exclude MEMORY.md', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, 'MEMORY.md'), 'long-term\n')
      await writeFile(join(memDir, '2026-02-07.md'), 'content\n')

      const result = await manager.listDailyLogs()

      expect(result).toEqual(['2026-02-07.md'])
    })

    it('should return empty array when directory does not exist', async () => {
      const badManager = new FileMemory(join(tmpDir, 'nonexistent'))

      const result = await badManager.listDailyLogs()

      expect(result).toEqual([])
    })
  })

  describe('readDailyLog', () => {
    it('should read specific daily log content', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, '2026-02-07.md'), '## 10:30 — some fact\n\n')

      const result = await manager.readDailyLog('2026-02-07.md')

      expect(result).toBe('## 10:30 — some fact\n\n')
    })

    it('should return empty string for nonexistent file', async () => {
      const result = await manager.readDailyLog('2099-01-01.md')

      expect(result).toBe('')
    })
  })

  describe('deleteDailyLog', () => {
    it('should remove the specified daily log file', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, '2026-01-01.md'), 'old content\n')

      await manager.deleteDailyLog('2026-01-01.md')

      const remaining = await manager.listDailyLogs()
      expect(remaining).not.toContain('2026-01-01.md')
    })

    it('should throw when file does not exist', async () => {
      await manager._ensureDir()

      await expect(manager.deleteDailyLog('nonexistent.md')).rejects.toThrow()
    })
  })

  describe('writeLongTermMemory', () => {
    it('should write content to MEMORY.md', async () => {
      await manager.writeLongTermMemory('# Facts\n- User likes Rust\n')

      const content = await readFile(join(tmpDir, 'memory', 'MEMORY.md'), 'utf8')
      expect(content).toBe('# Facts\n- User likes Rust\n')
    })

    it('should overwrite existing MEMORY.md', async () => {
      const memDir = join(tmpDir, 'memory')
      await manager._ensureDir()
      await writeFile(join(memDir, 'MEMORY.md'), 'old content')

      await manager.writeLongTermMemory('new content')

      const content = await readFile(join(memDir, 'MEMORY.md'), 'utf8')
      expect(content).toBe('new content')
    })

    it('should create directory if needed', async () => {
      const freshManager = new FileMemory(join(tmpDir, 'fresh'))

      await freshManager.writeLongTermMemory('brand new')

      const content = await readFile(join(tmpDir, 'fresh', 'memory', 'MEMORY.md'), 'utf8')
      expect(content).toBe('brand new')
    })
  })
})
