import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../../src/logger.js'
import HeuristicCompactor from '../../src/agent/heuristic-compactor.js'

/**
 * In-memory BaseMemory stub for testing the compactor algorithm.
 * Simulates daily logs and MEMORY.md without touching the filesystem.
 */
function createMemoryStub({ dailyLogs = {}, longTermMemory = '' } = {}) {
  const state = {
    dailyLogs: { ...dailyLogs },
    longTermMemory
  }

  return {
    listDailyLogs: vi.fn(async () => Object.keys(state.dailyLogs).sort()),
    readDailyLog: vi.fn(async (filename) => state.dailyLogs[filename] || ''),
    deleteDailyLog: vi.fn(async (filename) => { delete state.dailyLogs[filename] }),
    getLongTermMemory: vi.fn(async () => state.longTermMemory || ''),
    writeLongTermMemory: vi.fn(async (content) => { state.longTermMemory = content }),
    _state: state
  }
}

describe('HeuristicCompactor', () => {
  let compactor

  beforeEach(() => {
    compactor = new HeuristicCompactor()
    vi.clearAllMocks()
  })

  describe('compact', () => {
    it('should return zeros when no daily logs exist', async () => {
      const memory = createMemoryStub()

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats).toEqual({ compacted: 0, skipped: 0, deleted: 0 })
    })

    it('should return zeros when no logs are older than retention', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const memory = createMemoryStub({
        dailyLogs: {
          [`${today}.md`]: '## 10:00 -- Some fact\n\n'
        }
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats).toEqual({ compacted: 0, skipped: 0, deleted: 0 })
    })

    it('should compact entries from old logs into MEMORY.md', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- User prefers Rust\n\n## 11:30 -- Project uses Node.js 20\n\n'
        },
        longTermMemory: ''
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.compacted).toBe(2)
      expect(stats.deleted).toBe(1)
      expect(memory.writeLongTermMemory).toHaveBeenCalled()
      const written = memory.writeLongTermMemory.mock.calls[0][0]
      expect(written).toContain('- User prefers Rust')
      expect(written).toContain('- Project uses Node.js 20')
      expect(written).toContain('## Compacted memories')
    })

    it('should skip entries already in MEMORY.md (case-insensitive)', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- User prefers Rust\n\n## 11:30 -- New fact\n\n'
        },
        longTermMemory: '# Memory\n- user prefers rust\n'
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.compacted).toBe(1)
      expect(stats.skipped).toBe(1)
      const written = memory.writeLongTermMemory.mock.calls[0][0]
      expect(written).toContain('- New fact')
      expect(written).not.toMatch(/- User prefers Rust/)
    })

    it('should deduplicate entries within the same batch', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- Same fact\n\n',
          '2020-01-02.md': '## 12:00 -- Same fact\n\n'
        }
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.compacted).toBe(1)
      expect(stats.skipped).toBe(1)
    })

    it('should delete old log files after processing', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- Fact A\n\n',
          '2020-01-15.md': '## 14:00 -- Fact B\n\n'
        }
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.deleted).toBe(2)
      expect(memory.deleteDailyLog).toHaveBeenCalledWith('2020-01-01.md')
      expect(memory.deleteDailyLog).toHaveBeenCalledWith('2020-01-15.md')
    })

    it('should not delete recent logs', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- Old fact\n\n',
          [`${today}.md`]: '## 10:00 -- Today fact\n\n'
        }
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.deleted).toBe(1)
      expect(memory.deleteDailyLog).toHaveBeenCalledWith('2020-01-01.md')
      expect(memory.deleteDailyLog).not.toHaveBeenCalledWith(`${today}.md`)
    })

    it('should handle empty daily log files gracefully', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': ''
        }
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.compacted).toBe(0)
      expect(stats.skipped).toBe(0)
      expect(stats.deleted).toBe(1)
      expect(memory.writeLongTermMemory).not.toHaveBeenCalled()
    })

    it('should preserve existing MEMORY.md content when appending', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- New fact\n\n'
        },
        longTermMemory: '# Kenobot Memory\n- Existing fact\n'
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      const written = memory.writeLongTermMemory.mock.calls[0][0]
      expect(written).toContain('# Kenobot Memory')
      expect(written).toContain('- Existing fact')
      expect(written).toContain('- New fact')
    })

    it('should continue when deleteDailyLog fails', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- Fact A\n\n',
          '2020-01-02.md': '## 10:00 -- Fact B\n\n'
        }
      })
      memory.deleteDailyLog
        .mockRejectedValueOnce(new Error('EACCES'))
        .mockResolvedValueOnce()

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.compacted).toBe(2)
      expect(stats.deleted).toBe(1)
      expect(logger.warn).toHaveBeenCalledWith('compactor', 'delete_failed', expect.objectContaining({
        filename: '2020-01-01.md'
      }))
    })

    it('should respect retentionDays parameter', async () => {
      // Create a log from 10 days ago
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      const dateStr = tenDaysAgo.toISOString().slice(0, 10)

      const memory = createMemoryStub({
        dailyLogs: {
          [`${dateStr}.md`]: '## 10:00 -- Recent enough\n\n'
        }
      })

      // With 30 days retention, this should NOT be compacted
      const stats30 = await compactor.compact(memory, { retentionDays: 30, logger })
      expect(stats30.compacted).toBe(0)

      // With 5 days retention, this SHOULD be compacted
      const stats5 = await compactor.compact(memory, { retentionDays: 5, logger })
      expect(stats5.compacted).toBe(1)
    })

    it('should not write MEMORY.md when all entries are duplicates', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- Already known\n\n'
        },
        longTermMemory: '# Memory\n- Already known\n'
      })

      await compactor.compact(memory, { retentionDays: 30, logger })

      expect(memory.writeLongTermMemory).not.toHaveBeenCalled()
    })

    it('should handle multiple old logs across different dates', async () => {
      const memory = createMemoryStub({
        dailyLogs: {
          '2020-01-01.md': '## 10:00 -- Fact from January\n\n',
          '2020-06-15.md': '## 14:00 -- Fact from June\n\n## 15:00 -- Another June fact\n\n',
          '2020-12-31.md': '## 09:00 -- Year end fact\n\n'
        }
      })

      const stats = await compactor.compact(memory, { retentionDays: 30, logger })

      expect(stats.compacted).toBe(4)
      expect(stats.deleted).toBe(3)
      const written = memory.writeLongTermMemory.mock.calls[0][0]
      expect(written).toContain('- Fact from January')
      expect(written).toContain('- Fact from June')
      expect(written).toContain('- Another June fact')
      expect(written).toContain('- Year end fact')
    })
  })

  describe('_parseEntries', () => {
    it('should parse standard timestamped entries', () => {
      const content = '## 10:30 -- User prefers dark mode\n\n## 14:00 -- Project uses Vitest\n\n'
      const entries = compactor._parseEntries(content)

      expect(entries).toEqual(['User prefers dark mode', 'Project uses Vitest'])
    })

    it('should handle entries with colons and special characters', () => {
      const content = '## 10:00 -- Programming: user prefers Rust (>= 1.70)\n\n'
      const entries = compactor._parseEntries(content)

      expect(entries).toEqual(['Programming: user prefers Rust (>= 1.70)'])
    })

    it('should return empty array for content with no entries', () => {
      expect(compactor._parseEntries('')).toEqual([])
      expect(compactor._parseEntries('random text')).toEqual([])
    })

    it('should skip entries with empty text', () => {
      const content = '## 10:00 -- \n\n## 11:00 -- Valid entry\n\n'
      const entries = compactor._parseEntries(content)

      expect(entries).toEqual(['Valid entry'])
    })
  })

  describe('_isOlderThan', () => {
    it('should return true for dates before cutoff', () => {
      expect(compactor._isOlderThan('2025-01-01.md', '2025-06-01')).toBe(true)
    })

    it('should return false for dates at or after cutoff', () => {
      expect(compactor._isOlderThan('2025-06-01.md', '2025-06-01')).toBe(false)
      expect(compactor._isOlderThan('2025-12-31.md', '2025-06-01')).toBe(false)
    })
  })
})
