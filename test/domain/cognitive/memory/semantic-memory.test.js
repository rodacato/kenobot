import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import SemanticMemory from '../../../../src/domain/cognitive/memory/semantic-memory.js'

describe('SemanticMemory', () => {
  let semanticMemory
  let mockStore

  beforeEach(() => {
    mockStore = {
      readLongTermMemory: vi.fn().mockResolvedValue('# Long-term facts\n\nAdrian prefers Spanish'),
      getRecentDays: vi.fn().mockResolvedValue('# Recent notes\n\nLearned about n8n'),
      appendDaily: vi.fn().mockResolvedValue(undefined),
      writeLongTermMemory: vi.fn().mockResolvedValue(undefined)
    }

    semanticMemory = new SemanticMemory(mockStore)
    vi.clearAllMocks()
  })

  describe('getLongTerm', () => {
    it('should get long-term semantic memory', async () => {
      const result = await semanticMemory.getLongTerm()

      expect(result).toBe('# Long-term facts\n\nAdrian prefers Spanish')
      expect(mockStore.readLongTermMemory).toHaveBeenCalledOnce()
    })
  })

  describe('getRecent', () => {
    it('should get recent semantic notes with default days', async () => {
      const result = await semanticMemory.getRecent()

      expect(result).toBe('# Recent notes\n\nLearned about n8n')
      expect(mockStore.getRecentDays).toHaveBeenCalledWith(3)
    })

    it('should get recent semantic notes with custom days', async () => {
      const result = await semanticMemory.getRecent(7)

      expect(result).toBe('# Recent notes\n\nLearned about n8n')
      expect(mockStore.getRecentDays).toHaveBeenCalledWith(7)
    })
  })

  describe('addFact', () => {
    it('should add a semantic fact', async () => {
      await semanticMemory.addFact('User prefers TypeScript over JavaScript')

      expect(mockStore.appendDaily).toHaveBeenCalledWith('User prefers TypeScript over JavaScript')
    })

    it('should handle long facts', async () => {
      const longFact = 'A'.repeat(500)
      await semanticMemory.addFact(longFact)

      expect(mockStore.appendDaily).toHaveBeenCalledWith(longFact)
    })
  })

  describe('writeLongTerm', () => {
    it('should overwrite long-term memory', async () => {
      const newContent = '# Updated facts\n\nNew structure'
      await semanticMemory.writeLongTerm(newContent)

      expect(mockStore.writeLongTermMemory).toHaveBeenCalledWith(newContent)
    })

    it('should handle empty content', async () => {
      await semanticMemory.writeLongTerm('')

      expect(mockStore.writeLongTermMemory).toHaveBeenCalledWith('')
    })
  })
})
