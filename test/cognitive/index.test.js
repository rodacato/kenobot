import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import CognitiveSystem from '../../src/cognitive/index.js'

describe('CognitiveSystem', () => {
  let cognitive
  let mockStore
  let mockProvider
  let mockConfig

  beforeEach(() => {
    mockConfig = {
      memoryDays: 3
    }

    mockStore = {
      readLongTermMemory: vi.fn().mockResolvedValue('Long-term facts'),
      getRecentDays: vi.fn().mockResolvedValue('Recent notes'),
      getChatLongTermMemory: vi.fn().mockResolvedValue('Chat facts'),
      getChatRecentDays: vi.fn().mockResolvedValue('Chat recent'),
      getWorkingMemory: vi.fn().mockResolvedValue({ content: 'Working', updatedAt: Date.now() }),
      appendDaily: vi.fn().mockResolvedValue(undefined),
      appendChatDaily: vi.fn().mockResolvedValue(undefined),
      writeWorkingMemory: vi.fn().mockResolvedValue(undefined)
    }

    mockProvider = {}

    cognitive = new CognitiveSystem(mockConfig, mockStore, mockProvider)
    vi.clearAllMocks()
  })

  describe('buildContext', () => {
    it('should load all memory types', async () => {
      const context = await cognitive.buildContext('telegram-123', 'test message')

      expect(context).toHaveProperty('memory')
      expect(context).toHaveProperty('workingMemory')
      expect(context.memory.longTerm).toBe('Long-term facts')
      expect(context.memory.recentNotes).toBe('Recent notes')
      expect(context.memory.chatLongTerm).toBe('Chat facts')
      expect(context.memory.chatRecent).toBe('Chat recent')
      expect(context.workingMemory.content).toBe('Working')
    })

    it('should call store methods with correct params', async () => {
      await cognitive.buildContext('telegram-123', 'test')

      expect(mockStore.readLongTermMemory).toHaveBeenCalledOnce()
      expect(mockStore.getRecentDays).toHaveBeenCalledWith(3)
      expect(mockStore.getChatLongTermMemory).toHaveBeenCalledWith('telegram-123')
      expect(mockStore.getChatRecentDays).toHaveBeenCalledWith('telegram-123', 3)
      expect(mockStore.getWorkingMemory).toHaveBeenCalledWith('telegram-123')
    })

    it('should handle null working memory', async () => {
      mockStore.getWorkingMemory.mockResolvedValue(null)

      const context = await cognitive.buildContext('telegram-123', 'test')

      expect(context.workingMemory).toBeNull()
    })
  })

  describe('saveMemory', () => {
    it('should save global facts', async () => {
      await cognitive.saveMemory('telegram-123', {
        memory: ['Fact 1', 'Fact 2']
      })

      expect(mockStore.appendDaily).toHaveBeenCalledTimes(2)
      expect(mockStore.appendDaily).toHaveBeenCalledWith('Fact 1')
      expect(mockStore.appendDaily).toHaveBeenCalledWith('Fact 2')
    })

    it('should save chat-specific facts', async () => {
      await cognitive.saveMemory('telegram-123', {
        chatMemory: ['Chat fact 1']
      })

      expect(mockStore.appendChatDaily).toHaveBeenCalledOnce()
      expect(mockStore.appendChatDaily).toHaveBeenCalledWith('telegram-123', 'Chat fact 1')
    })

    it('should save working memory', async () => {
      await cognitive.saveMemory('telegram-123', {
        workingMemory: 'Current task: testing'
      })

      expect(mockStore.writeWorkingMemory).toHaveBeenCalledOnce()
      expect(mockStore.writeWorkingMemory).toHaveBeenCalledWith('telegram-123', 'Current task: testing')
    })

    it('should save all memory types at once', async () => {
      await cognitive.saveMemory('telegram-123', {
        memory: ['Global fact'],
        chatMemory: ['Chat fact'],
        workingMemory: 'Working content'
      })

      expect(mockStore.appendDaily).toHaveBeenCalledOnce()
      expect(mockStore.appendChatDaily).toHaveBeenCalledOnce()
      expect(mockStore.writeWorkingMemory).toHaveBeenCalledOnce()
    })

    it('should handle empty memory tags', async () => {
      await cognitive.saveMemory('telegram-123', {})

      expect(mockStore.appendDaily).not.toHaveBeenCalled()
      expect(mockStore.appendChatDaily).not.toHaveBeenCalled()
      expect(mockStore.writeWorkingMemory).not.toHaveBeenCalled()
    })
  })

  describe('getMemorySystem', () => {
    it('should return memory system instance', () => {
      const memorySystem = cognitive.getMemorySystem()

      expect(memorySystem).toBeDefined()
      expect(memorySystem.constructor.name).toBe('MemorySystem')
    })
  })
})
