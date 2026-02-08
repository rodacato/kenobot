import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../../src/logger.js'
import CompactingMemory from '../../src/agent/compacting-memory.js'

function createInnerMemory() {
  return {
    appendDaily: vi.fn(),
    getRecentDays: vi.fn().mockResolvedValue('recent notes'),
    getLongTermMemory: vi.fn().mockResolvedValue('long term'),
    appendChatDaily: vi.fn(),
    getChatRecentDays: vi.fn().mockResolvedValue('chat recent'),
    getChatLongTermMemory: vi.fn().mockResolvedValue('chat long term'),
    listDailyLogs: vi.fn().mockResolvedValue([]),
    readDailyLog: vi.fn().mockResolvedValue(''),
    deleteDailyLog: vi.fn(),
    writeLongTermMemory: vi.fn()
  }
}

function createCompactor(result = { compacted: 0, skipped: 0, deleted: 0 }) {
  return {
    compact: vi.fn().mockResolvedValue(result)
  }
}

describe('CompactingMemory', () => {
  let inner, compactor, memory

  beforeEach(() => {
    inner = createInnerMemory()
    compactor = createCompactor()
    memory = new CompactingMemory(inner, compactor, { retentionDays: 30, logger })
    vi.clearAllMocks()
  })

  describe('CRUD delegation', () => {
    it('should delegate appendDaily to inner', async () => {
      await memory.appendDaily('test entry')
      expect(inner.appendDaily).toHaveBeenCalledWith('test entry')
    })

    it('should delegate getRecentDays to inner', async () => {
      const result = await memory.getRecentDays(5)
      expect(inner.getRecentDays).toHaveBeenCalledWith(5)
      expect(result).toBe('recent notes')
    })

    it('should delegate getLongTermMemory to inner', async () => {
      const result = await memory.getLongTermMemory()
      expect(inner.getLongTermMemory).toHaveBeenCalled()
      expect(result).toBe('long term')
    })

    it('should delegate appendChatDaily to inner', async () => {
      await memory.appendChatDaily('telegram-123', 'chat entry')
      expect(inner.appendChatDaily).toHaveBeenCalledWith('telegram-123', 'chat entry')
    })

    it('should delegate getChatRecentDays to inner', async () => {
      const result = await memory.getChatRecentDays('telegram-123', 7)
      expect(inner.getChatRecentDays).toHaveBeenCalledWith('telegram-123', 7)
      expect(result).toBe('chat recent')
    })

    it('should delegate getChatLongTermMemory to inner', async () => {
      const result = await memory.getChatLongTermMemory('telegram-123')
      expect(inner.getChatLongTermMemory).toHaveBeenCalledWith('telegram-123')
      expect(result).toBe('chat long term')
    })

    it('should delegate compaction support methods to inner', async () => {
      await memory.listDailyLogs()
      await memory.readDailyLog('2020-01-01.md')
      await memory.deleteDailyLog('2020-01-01.md')
      await memory.writeLongTermMemory('content')

      expect(inner.listDailyLogs).toHaveBeenCalled()
      expect(inner.readDailyLog).toHaveBeenCalledWith('2020-01-01.md')
      expect(inner.deleteDailyLog).toHaveBeenCalledWith('2020-01-01.md')
      expect(inner.writeLongTermMemory).toHaveBeenCalledWith('content')
    })
  })

  describe('compact', () => {
    it('should call compactor with inner memory and options', async () => {
      await memory.compact()

      expect(compactor.compact).toHaveBeenCalledWith(inner, {
        retentionDays: 30,
        logger
      })
    })

    it('should return compactor stats', async () => {
      compactor.compact.mockResolvedValue({ compacted: 3, skipped: 1, deleted: 2 })

      const stats = await memory.compact()

      expect(stats).toEqual({ compacted: 3, skipped: 1, deleted: 2 })
    })

    it('should guard against concurrent compaction', async () => {
      // Make compact take a while
      compactor.compact.mockImplementation(() => new Promise(resolve =>
        setTimeout(() => resolve({ compacted: 0, skipped: 0, deleted: 0 }), 50)
      ))

      const [first, second] = await Promise.all([
        memory.compact(),
        memory.compact()
      ])

      expect(first).toEqual({ compacted: 0, skipped: 0, deleted: 0 })
      expect(second).toBeNull()
      expect(compactor.compact).toHaveBeenCalledTimes(1)
    })

    it('should reset _compacting flag after completion', async () => {
      await memory.compact()
      expect(memory._compacting).toBe(false)

      // Should be able to compact again
      const stats = await memory.compact()
      expect(stats).not.toBeNull()
      expect(compactor.compact).toHaveBeenCalledTimes(2)
    })

    it('should reset _compacting flag on error', async () => {
      compactor.compact.mockRejectedValue(new Error('boom'))

      await expect(memory.compact()).rejects.toThrow('boom')
      expect(memory._compacting).toBe(false)

      // Should be able to compact again after error
      compactor.compact.mockResolvedValue({ compacted: 0, skipped: 0, deleted: 0 })
      const stats = await memory.compact()
      expect(stats).not.toBeNull()
    })

    it('should set lastCompaction timestamp on success', async () => {
      expect(memory._lastCompaction).toBeNull()

      await memory.compact()

      expect(memory._lastCompaction).toBeInstanceOf(Date)
    })

    it('should log completion', async () => {
      compactor.compact.mockResolvedValue({ compacted: 2, skipped: 1, deleted: 3 })

      await memory.compact()

      expect(logger.info).toHaveBeenCalledWith('compacting-memory', 'done', {
        compacted: 2, skipped: 1, deleted: 3
      })
    })

    it('should log error on failure', async () => {
      compactor.compact.mockRejectedValue(new Error('disk error'))

      await expect(memory.compact()).rejects.toThrow('disk error')

      expect(logger.error).toHaveBeenCalledWith('compacting-memory', 'failed', {
        error: 'disk error'
      })
    })
  })

  describe('getCompactionStatus', () => {
    it('should return status with defaults', () => {
      const status = memory.getCompactionStatus()

      expect(status).toEqual({
        retentionDays: 30,
        lastCompaction: null,
        isCompacting: false,
        compactor: 'Object'
      })
    })

    it('should reflect compaction state after running', async () => {
      await memory.compact()

      const status = memory.getCompactionStatus()
      expect(status.lastCompaction).toBeInstanceOf(Date)
      expect(status.isCompacting).toBe(false)
    })
  })
})
