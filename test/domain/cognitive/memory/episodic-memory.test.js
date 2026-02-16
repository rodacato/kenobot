import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import EpisodicMemory from '../../../../src/domain/cognitive/memory/episodic-memory.js'

describe('EpisodicMemory', () => {
  let episodicMemory
  let mockStore

  beforeEach(() => {
    mockStore = {
      getChatLongTermMemory: vi.fn().mockResolvedValue('Chat long-term facts'),
      getChatRecentDays: vi.fn().mockResolvedValue('Chat recent notes'),
      appendChatDaily: vi.fn().mockResolvedValue(undefined),
      getRecentDays: vi.fn().mockResolvedValue('Shared episodes'),
      appendDaily: vi.fn().mockResolvedValue(undefined)
    }

    episodicMemory = new EpisodicMemory(mockStore)
    vi.clearAllMocks()
  })

  describe('getChatLongTerm', () => {
    it('should get chat-specific long-term memory', async () => {
      const result = await episodicMemory.getChatLongTerm('telegram-123')

      expect(result).toBe('Chat long-term facts')
      expect(mockStore.getChatLongTermMemory).toHaveBeenCalledWith('telegram-123')
    })
  })

  describe('getChatRecent', () => {
    it('should get recent chat episodes with default days', async () => {
      const result = await episodicMemory.getChatRecent('telegram-123')

      expect(result).toBe('Chat recent notes')
      expect(mockStore.getChatRecentDays).toHaveBeenCalledWith('telegram-123', 7)
    })

    it('should get recent chat episodes with custom days', async () => {
      const result = await episodicMemory.getChatRecent('telegram-123', 7)

      expect(result).toBe('Chat recent notes')
      expect(mockStore.getChatRecentDays).toHaveBeenCalledWith('telegram-123', 7)
    })
  })

  describe('addChatEpisode', () => {
    it('should add chat-specific episode', async () => {
      await episodicMemory.addChatEpisode('telegram-123', 'User mentioned vacation plans')

      expect(mockStore.appendChatDaily).toHaveBeenCalledWith('telegram-123', 'User mentioned vacation plans')
    })

    it('should handle empty episode', async () => {
      await episodicMemory.addChatEpisode('telegram-123', '')

      expect(mockStore.appendChatDaily).toHaveBeenCalledWith('telegram-123', '')
    })
  })

  describe('getSharedRecent', () => {
    it('should get shared episodes with default days', async () => {
      const result = await episodicMemory.getSharedRecent()

      expect(result).toBe('Shared episodes')
      expect(mockStore.getRecentDays).toHaveBeenCalledWith(7)
    })

    it('should get shared episodes with custom days', async () => {
      const result = await episodicMemory.getSharedRecent(5)

      expect(result).toBe('Shared episodes')
      expect(mockStore.getRecentDays).toHaveBeenCalledWith(5)
    })
  })

  describe('addSharedEpisode', () => {
    it('should add shared episode', async () => {
      await episodicMemory.addSharedEpisode('System restart occurred')

      expect(mockStore.appendDaily).toHaveBeenCalledWith('System restart occurred')
    })
  })
})
