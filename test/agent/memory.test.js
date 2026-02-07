import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  appendFile: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn()
}))

import { readFile, appendFile, readdir, mkdir } from 'node:fs/promises'
import logger from '../../src/logger.js'
import MemoryManager from '../../src/agent/memory.js'

describe('MemoryManager', () => {
  let manager

  beforeEach(() => {
    manager = new MemoryManager('./data')
    manager._dirReady = true // skip mkdir in tests
    vi.clearAllMocks()
  })

  describe('appendDaily', () => {
    it('should append timestamped entry to daily file', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-02-07T10:30:00Z'))

      await manager.appendDaily('User prefers Spanish')

      expect(appendFile).toHaveBeenCalledWith(
        'data/memory/2026-02-07.md',
        '## 10:30 — User prefers Spanish\n\n',
        'utf8'
      )

      vi.useRealTimers()
    })

    it('should use current date for filename', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-12-25T14:00:00Z'))

      await manager.appendDaily('Christmas note')

      expect(appendFile).toHaveBeenCalledWith(
        expect.stringContaining('2026-12-25.md'),
        expect.any(String),
        'utf8'
      )

      vi.useRealTimers()
    })

    it('should ensure directory exists', async () => {
      manager._dirReady = false

      await manager.appendDaily('test')

      expect(mkdir).toHaveBeenCalledWith('data/memory', { recursive: true })
    })
  })

  describe('getRecentDays', () => {
    it('should return empty string when no files exist', async () => {
      readdir.mockResolvedValue([])

      const result = await manager.getRecentDays(3)

      expect(result).toBe('')
    })

    it('should return content of recent daily files', async () => {
      readdir.mockResolvedValue(['2026-02-06.md', '2026-02-07.md', 'MEMORY.md'])
      readFile.mockImplementation(async (path) => {
        if (path.includes('2026-02-07')) return '## 10:30 — fact one\n'
        if (path.includes('2026-02-06')) return '## 09:00 — fact two\n'
        return ''
      })

      const result = await manager.getRecentDays(3)

      expect(result).toContain('### 2026-02-07')
      expect(result).toContain('fact one')
      expect(result).toContain('### 2026-02-06')
      expect(result).toContain('fact two')
    })

    it('should return most recent days first', async () => {
      readdir.mockResolvedValue(['2026-02-05.md', '2026-02-06.md', '2026-02-07.md'])
      readFile.mockResolvedValue('content\n')

      const result = await manager.getRecentDays(3)

      const idx07 = result.indexOf('2026-02-07')
      const idx06 = result.indexOf('2026-02-06')
      const idx05 = result.indexOf('2026-02-05')
      expect(idx07).toBeLessThan(idx06)
      expect(idx06).toBeLessThan(idx05)
    })

    it('should limit to N days', async () => {
      readdir.mockResolvedValue([
        '2026-02-04.md', '2026-02-05.md', '2026-02-06.md', '2026-02-07.md'
      ])
      readFile.mockResolvedValue('content\n')

      const result = await manager.getRecentDays(2)

      expect(result).toContain('2026-02-07')
      expect(result).toContain('2026-02-06')
      expect(result).not.toContain('2026-02-05')
      expect(result).not.toContain('2026-02-04')
    })

    it('should exclude MEMORY.md from daily files', async () => {
      readdir.mockResolvedValue(['MEMORY.md', '2026-02-07.md'])
      readFile.mockResolvedValue('content\n')

      const result = await manager.getRecentDays(3)

      expect(result).not.toContain('### MEMORY')
      expect(result).toContain('### 2026-02-07')
    })

    it('should skip unreadable files gracefully', async () => {
      readdir.mockResolvedValue(['2026-02-06.md', '2026-02-07.md'])
      readFile.mockImplementation(async (path) => {
        if (path.includes('2026-02-06')) throw new Error('read error')
        return '## 10:00 — entry\n'
      })

      const result = await manager.getRecentDays(3)

      expect(result).toContain('2026-02-07')
      expect(result).not.toContain('2026-02-06')
    })

    it('should return empty string when readdir fails', async () => {
      readdir.mockRejectedValue(new Error('ENOENT'))

      const result = await manager.getRecentDays(3)

      expect(result).toBe('')
    })
  })

  describe('getLongTermMemory', () => {
    it('should return MEMORY.md content', async () => {
      readFile.mockResolvedValue('# Long-term facts\n- User likes Star Wars')

      const result = await manager.getLongTermMemory()

      expect(result).toBe('# Long-term facts\n- User likes Star Wars')
      expect(readFile).toHaveBeenCalledWith('data/memory/MEMORY.md', 'utf8')
    })

    it('should return empty string when MEMORY.md does not exist', async () => {
      readFile.mockRejectedValue(new Error('ENOENT'))

      const result = await manager.getLongTermMemory()

      expect(result).toBe('')
    })

    it('should log warning when MEMORY.md exceeds 10KB', async () => {
      const largeContent = 'x'.repeat(11000)
      readFile.mockResolvedValue(largeContent)

      const result = await manager.getLongTermMemory()

      expect(result).toBe(largeContent)
      expect(logger.warn).toHaveBeenCalledWith('memory', 'memory_file_large', expect.objectContaining({
        file: 'MEMORY.md',
        sizeBytes: 11000
      }))
    })

    it('should not log warning when MEMORY.md is under 10KB', async () => {
      const smallContent = 'x'.repeat(5000)
      readFile.mockResolvedValue(smallContent)

      await manager.getLongTermMemory()

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })
})
