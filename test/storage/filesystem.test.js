import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
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
import FilesystemStorage from '../../src/storage/filesystem.js'

describe('FilesystemStorage', () => {
  let storage
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-storage-'))
    storage = new FilesystemStorage({ dataDir: tmpDir })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('loadSession', () => {
    it('should return empty array for non-existent session', async () => {
      const result = await storage.loadSession('telegram-123')
      expect(result).toEqual([])
    })

    it('should parse JSONL file and return messages', async () => {
      const sessionsDir = join(tmpDir, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      const lines = [
        '{"role":"user","content":"hello","timestamp":1000}',
        '{"role":"assistant","content":"hi there","timestamp":1001}'
      ].join('\n')
      await writeFile(join(sessionsDir, 'telegram-123.jsonl'), lines)

      const result = await storage.loadSession('telegram-123')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ role: 'user', content: 'hello', timestamp: 1000 })
      expect(result[1]).toEqual({ role: 'assistant', content: 'hi there', timestamp: 1001 })
    })

    it('should return only the last N messages when limit is applied', async () => {
      const sessionsDir = join(tmpDir, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      const lines = Array.from({ length: 30 }, (_, i) =>
        JSON.stringify({ role: 'user', content: `msg ${i}`, timestamp: i })
      ).join('\n')
      await writeFile(join(sessionsDir, 'telegram-123.jsonl'), lines)

      const result = await storage.loadSession('telegram-123', 5)

      expect(result).toHaveLength(5)
      expect(result[0].content).toBe('msg 25')
      expect(result[4].content).toBe('msg 29')
    })

    it('should use default limit of 20', async () => {
      const sessionsDir = join(tmpDir, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      const lines = Array.from({ length: 30 }, (_, i) =>
        JSON.stringify({ role: 'user', content: `msg ${i}`, timestamp: i })
      ).join('\n')
      await writeFile(join(sessionsDir, 'telegram-123.jsonl'), lines)

      const result = await storage.loadSession('telegram-123')

      expect(result).toHaveLength(20)
      expect(result[0].content).toBe('msg 10')
    })

    it('should skip corrupt JSONL lines with warning', async () => {
      const sessionsDir = join(tmpDir, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      const lines = [
        '{"role":"user","content":"good","timestamp":1000}',
        'this is not json',
        '{"role":"assistant","content":"also good","timestamp":1001}'
      ].join('\n')
      await writeFile(join(sessionsDir, 'telegram-123.jsonl'), lines)

      const result = await storage.loadSession('telegram-123')

      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('good')
      expect(result[1].content).toBe('also good')
      expect(logger.warn).toHaveBeenCalledWith('storage', 'corrupt_jsonl_line', expect.any(Object))
    })

    it('should handle trailing newline in file', async () => {
      const sessionsDir = join(tmpDir, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      await writeFile(
        join(sessionsDir, 'telegram-123.jsonl'),
        '{"role":"user","content":"hello","timestamp":1000}\n'
      )

      const result = await storage.loadSession('telegram-123')

      expect(result).toHaveLength(1)
    })
  })

  describe('saveSession', () => {
    it('should create sessions directory and write messages', async () => {
      await storage.saveSession('telegram-123', [
        { role: 'user', content: 'hello', timestamp: 1000 }
      ])

      const result = await storage.loadSession('telegram-123')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ role: 'user', content: 'hello', timestamp: 1000 })
    })

    it('should append messages on subsequent writes', async () => {
      await storage.saveSession('telegram-123', [
        { role: 'user', content: 'first', timestamp: 1000 }
      ])
      await storage.saveSession('telegram-123', [
        { role: 'user', content: 'second', timestamp: 2000 }
      ])

      const result = await storage.loadSession('telegram-123')
      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('first')
      expect(result[1].content).toBe('second')
    })

    it('should write valid JSONL format', async () => {
      await storage.saveSession('telegram-123', [
        { role: 'user', content: 'hello', timestamp: 1000 },
        { role: 'assistant', content: 'hi', timestamp: 1001 }
      ])

      const result = await storage.loadSession('telegram-123')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ role: 'user', content: 'hello', timestamp: 1000 })
      expect(result[1]).toEqual({ role: 'assistant', content: 'hi', timestamp: 1001 })
    })
  })

  describe('readFile', () => {
    it('should return file contents as string', async () => {
      const filePath = join(tmpDir, 'IDENTITY.md')
      await writeFile(filePath, '# KenoBot Identity\nI am KenoBot.')

      const result = await storage.readFile(filePath)

      expect(result).toBe('# KenoBot Identity\nI am KenoBot.')
    })

    it('should throw descriptive error for missing file', async () => {
      await expect(storage.readFile(join(tmpDir, 'missing.md'))).rejects.toThrow('File not found:')
    })
  })

  describe('name', () => {
    it('should return filesystem', () => {
      expect(storage.name).toBe('filesystem')
    })
  })

  describe('round-trip', () => {
    it('should persist and retrieve a multi-turn conversation', async () => {
      const messages = [
        { role: 'user', content: 'What is 2+2?', timestamp: 1000 },
        { role: 'assistant', content: '4', timestamp: 1001 },
        { role: 'user', content: 'And 3+3?', timestamp: 1002 },
        { role: 'assistant', content: '6', timestamp: 1003 }
      ]

      await storage.saveSession('telegram-456', messages)

      const result = await storage.loadSession('telegram-456')
      expect(result).toEqual(messages)
    })

    it('should accumulate messages across multiple save calls', async () => {
      await storage.saveSession('telegram-789', [
        { role: 'user', content: 'turn 1', timestamp: 1000 },
        { role: 'assistant', content: 'reply 1', timestamp: 1001 }
      ])
      await storage.saveSession('telegram-789', [
        { role: 'user', content: 'turn 2', timestamp: 2000 },
        { role: 'assistant', content: 'reply 2', timestamp: 2001 }
      ])

      const result = await storage.loadSession('telegram-789')
      expect(result).toHaveLength(4)
      expect(result[2].content).toBe('turn 2')
    })
  })
})
