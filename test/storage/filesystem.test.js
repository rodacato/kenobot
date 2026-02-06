import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

// Suppress logger console output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { readFile, appendFile, mkdir } from 'node:fs/promises'
import logger from '../../src/logger.js'
import FilesystemStorage from '../../src/storage/filesystem.js'

describe('FilesystemStorage', () => {
  let storage

  beforeEach(() => {
    storage = new FilesystemStorage({ dataDir: '/tmp/test-data' })
    vi.clearAllMocks()
  })

  describe('loadSession', () => {
    it('should return empty array for non-existent session', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

      const result = await storage.loadSession('telegram-123')
      expect(result).toEqual([])
    })

    it('should parse JSONL file and return messages', async () => {
      const lines = [
        '{"role":"user","content":"hello","timestamp":1000}',
        '{"role":"assistant","content":"hi there","timestamp":1001}'
      ].join('\n')
      readFile.mockResolvedValue(lines)

      const result = await storage.loadSession('telegram-123')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ role: 'user', content: 'hello', timestamp: 1000 })
      expect(result[1]).toEqual({ role: 'assistant', content: 'hi there', timestamp: 1001 })
    })

    it('should return only the last N messages when limit is applied', async () => {
      const lines = Array.from({ length: 30 }, (_, i) =>
        JSON.stringify({ role: 'user', content: `msg ${i}`, timestamp: i })
      ).join('\n')
      readFile.mockResolvedValue(lines)

      const result = await storage.loadSession('telegram-123', 5)
      expect(result).toHaveLength(5)
      expect(result[0].content).toBe('msg 25')
      expect(result[4].content).toBe('msg 29')
    })

    it('should use default limit of 20', async () => {
      const lines = Array.from({ length: 30 }, (_, i) =>
        JSON.stringify({ role: 'user', content: `msg ${i}`, timestamp: i })
      ).join('\n')
      readFile.mockResolvedValue(lines)

      const result = await storage.loadSession('telegram-123')
      expect(result).toHaveLength(20)
      expect(result[0].content).toBe('msg 10')
    })

    it('should skip corrupt JSONL lines with warning', async () => {
      const lines = [
        '{"role":"user","content":"good","timestamp":1000}',
        'this is not json',
        '{"role":"assistant","content":"also good","timestamp":1001}'
      ].join('\n')
      readFile.mockResolvedValue(lines)

      const result = await storage.loadSession('telegram-123')
      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('good')
      expect(result[1].content).toBe('also good')
      expect(logger.warn).toHaveBeenCalledWith('storage', 'corrupt_jsonl_line', expect.any(Object))
    })

    it('should handle trailing newline in file', async () => {
      const lines = '{"role":"user","content":"hello","timestamp":1000}\n'
      readFile.mockResolvedValue(lines)

      const result = await storage.loadSession('telegram-123')
      expect(result).toHaveLength(1)
    })

    it('should re-throw non-ENOENT errors', async () => {
      readFile.mockRejectedValue(new Error('permission denied'))

      await expect(storage.loadSession('telegram-123')).rejects.toThrow('permission denied')
    })
  })

  describe('saveSession', () => {
    it('should create sessions directory on first write', async () => {
      await storage.saveSession('telegram-123', [
        { role: 'user', content: 'hello', timestamp: 1000 }
      ])

      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining('sessions'),
        { recursive: true }
      )
    })

    it('should only create directory once', async () => {
      await storage.saveSession('telegram-123', [{ role: 'user', content: 'a', timestamp: 1 }])
      await storage.saveSession('telegram-123', [{ role: 'user', content: 'b', timestamp: 2 }])

      expect(mkdir).toHaveBeenCalledTimes(1)
    })

    it('should append messages as JSONL lines', async () => {
      await storage.saveSession('telegram-123', [
        { role: 'user', content: 'hello', timestamp: 1000 },
        { role: 'assistant', content: 'hi', timestamp: 1001 }
      ])

      expect(appendFile).toHaveBeenCalledOnce()
      const data = appendFile.mock.calls[0][1]
      const lines = data.split('\n').filter(Boolean)
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0])).toEqual({ role: 'user', content: 'hello', timestamp: 1000 })
      expect(JSON.parse(lines[1])).toEqual({ role: 'assistant', content: 'hi', timestamp: 1001 })
    })

    it('should write to correct session file path', async () => {
      await storage.saveSession('telegram-123', [
        { role: 'user', content: 'test', timestamp: 1000 }
      ])

      const filepath = appendFile.mock.calls[0][0]
      expect(filepath).toContain('sessions')
      expect(filepath).toContain('telegram-123.jsonl')
    })
  })

  describe('readFile', () => {
    it('should return file contents as string', async () => {
      readFile.mockResolvedValue('# KenoBot Identity\nI am KenoBot.')

      const result = await storage.readFile('/path/to/IDENTITY.md')
      expect(result).toBe('# KenoBot Identity\nI am KenoBot.')
    })

    it('should throw descriptive error for missing file', async () => {
      readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

      await expect(storage.readFile('/missing/file.md')).rejects.toThrow('File not found: /missing/file.md')
    })

    it('should re-throw non-ENOENT errors', async () => {
      readFile.mockRejectedValue(new Error('permission denied'))

      await expect(storage.readFile('/path')).rejects.toThrow('permission denied')
    })
  })

  describe('name', () => {
    it('should return filesystem', () => {
      expect(storage.name).toBe('filesystem')
    })
  })
})
