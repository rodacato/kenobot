import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import MemorySystem from '../../../src/cognitive/memory/memory-system.js'

describe('MemorySystem', () => {
  let memorySystem
  let mockStore

  beforeEach(() => {
    mockStore = {
      readLongTermMemory: vi.fn().mockResolvedValue('Long-term facts'),
      getRecentDays: vi.fn().mockResolvedValue('Recent notes'),
      getChatLongTermMemory: vi.fn().mockResolvedValue('Chat facts'),
      getChatRecentDays: vi.fn().mockResolvedValue('Chat recent'),
      getWorkingMemory: vi.fn().mockResolvedValue({ content: 'Working', updatedAt: Date.now() }),
      appendDaily: vi.fn().mockResolvedValue(undefined),
      appendChatDaily: vi.fn().mockResolvedValue(undefined),
      writeWorkingMemory: vi.fn().mockResolvedValue(undefined),
      writeLongTermMemory: vi.fn().mockResolvedValue(undefined),
      listDailyLogs: vi.fn().mockResolvedValue([]),
      readDailyLog: vi.fn().mockResolvedValue('')
    }

    memorySystem = new MemorySystem(mockStore)
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize all 4 memory types', () => {
      expect(memorySystem.working).toBeDefined()
      expect(memorySystem.episodic).toBeDefined()
      expect(memorySystem.semantic).toBeDefined()
      expect(memorySystem.procedural).toBeDefined()
    })
  })

  describe('semantic memory delegation', () => {
    it('should delegate getLongTermMemory to semantic', async () => {
      const result = await memorySystem.getLongTermMemory()

      expect(result).toBe('Long-term facts')
      expect(mockStore.readLongTermMemory).toHaveBeenCalledOnce()
    })

    it('should delegate getRecentDays to semantic', async () => {
      const result = await memorySystem.getRecentDays(3)

      expect(result).toBe('Recent notes')
      expect(mockStore.getRecentDays).toHaveBeenCalledWith(3)
    })

    it('should delegate addFact to semantic', async () => {
      await memorySystem.addFact('New fact')

      expect(mockStore.appendDaily).toHaveBeenCalledWith('New fact')
    })

    it('should delegate writeLongTermMemory to semantic', async () => {
      await memorySystem.writeLongTermMemory('New content')

      expect(mockStore.writeLongTermMemory).toHaveBeenCalledWith('New content')
    })
  })

  describe('episodic memory delegation', () => {
    it('should delegate getChatLongTermMemory to episodic', async () => {
      const result = await memorySystem.getChatLongTermMemory('session-123')

      expect(result).toBe('Chat facts')
      expect(mockStore.getChatLongTermMemory).toHaveBeenCalledWith('session-123')
    })

    it('should delegate getChatRecentDays to episodic', async () => {
      const result = await memorySystem.getChatRecentDays('session-123', 5)

      expect(result).toBe('Chat recent')
      expect(mockStore.getChatRecentDays).toHaveBeenCalledWith('session-123', 5)
    })

    it('should delegate addChatFact to episodic', async () => {
      await memorySystem.addChatFact('session-123', 'Chat episode')

      expect(mockStore.appendChatDaily).toHaveBeenCalledWith('session-123', 'Chat episode')
    })
  })

  describe('working memory delegation', () => {
    it('should delegate getWorkingMemory to working', async () => {
      const result = await memorySystem.getWorkingMemory('session-123')

      expect(result).toMatchObject({ content: 'Working' })
      expect(mockStore.getWorkingMemory).toHaveBeenCalledWith('session-123')
    })

    it('should delegate replaceWorkingMemory to working', async () => {
      await memorySystem.replaceWorkingMemory('session-123', 'New working content')

      expect(mockStore.writeWorkingMemory).toHaveBeenCalledWith('session-123', 'New working content')
    })
  })

  describe('procedural memory delegation', () => {
    it('should delegate getPatterns to procedural', async () => {
      const result = await memorySystem.getPatterns()

      expect(result).toEqual([])
    })

    it('should delegate matchPatterns to procedural', async () => {
      const result = await memorySystem.matchPatterns('test message')

      expect(result).toEqual([])
    })
  })

  describe('compaction support', () => {
    it('should delegate listDailyLogs to store', async () => {
      const result = await memorySystem.listDailyLogs()

      expect(result).toEqual([])
      expect(mockStore.listDailyLogs).toHaveBeenCalledOnce()
    })

    it('should delegate readDailyLog to store', async () => {
      const result = await memorySystem.readDailyLog('2024-01-15.md')

      expect(result).toBe('')
      expect(mockStore.readDailyLog).toHaveBeenCalledWith('2024-01-15.md')
    })
  })
})
