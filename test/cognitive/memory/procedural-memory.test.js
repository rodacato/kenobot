import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ProceduralMemory from '../../../src/cognitive/memory/procedural-memory.js'

describe('ProceduralMemory', () => {
  let proceduralMemory
  let mockStore

  beforeEach(() => {
    mockStore = {
      readPatterns: vi.fn().mockResolvedValue([]),
      writePatterns: vi.fn().mockResolvedValue(undefined)
    }
    proceduralMemory = new ProceduralMemory(mockStore)
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return empty array initially', async () => {
      const result = await proceduralMemory.getAll()

      expect(result).toEqual([])
    })

    it('should load patterns from store on first access', async () => {
      const storedPatterns = [
        { id: 'p1', trigger: 'test', response: 'action', confidence: 0.8, usageCount: 0, createdAt: '2025-01-01' }
      ]
      mockStore.readPatterns.mockResolvedValue(storedPatterns)

      const result = await proceduralMemory.getAll()

      expect(result).toEqual(storedPatterns)
      expect(mockStore.readPatterns).toHaveBeenCalledOnce()
    })

    it('should only load from store once', async () => {
      mockStore.readPatterns.mockResolvedValue([])

      await proceduralMemory.getAll()
      await proceduralMemory.getAll()

      expect(mockStore.readPatterns).toHaveBeenCalledOnce()
    })

    it('should return added patterns', async () => {
      await proceduralMemory.add({
        id: 'pattern-1',
        trigger: 'n8n + 401 error',
        response: 'Check ?token= query param',
        confidence: 0.8
      })

      const result = await proceduralMemory.getAll()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'pattern-1',
        trigger: 'n8n + 401 error',
        response: 'Check ?token= query param',
        confidence: 0.8
      })
    })

    it('should work with a store that has no readPatterns method', async () => {
      const basicStore = {}
      const pm = new ProceduralMemory(basicStore)

      const result = await pm.getAll()
      expect(result).toEqual([])
    })
  })

  describe('match', () => {
    it('should return empty array when no patterns', async () => {
      const result = await proceduralMemory.match('some message text')

      expect(result).toEqual([])
    })

    it('should return empty array for empty message', async () => {
      await proceduralMemory.add({
        id: 'p1',
        trigger: 'n8n webhook error',
        response: 'Check token param',
        confidence: 0.9
      })

      const result = await proceduralMemory.match('')

      expect(result).toEqual([])
    })

    it('should match patterns by trigger keywords', async () => {
      await proceduralMemory.add({
        id: 'p1',
        trigger: 'n8n webhook error',
        response: 'Check token param',
        confidence: 0.9
      })

      const result = await proceduralMemory.match('I got an error with n8n webhook')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('p1')
      expect(result[0].score).toBeGreaterThan(0)
    })

    it('should not match when no keywords overlap', async () => {
      await proceduralMemory.add({
        id: 'p1',
        trigger: 'n8n webhook error',
        response: 'Check token param',
        confidence: 0.9
      })

      const result = await proceduralMemory.match('How is the weather today?')

      expect(result).toEqual([])
    })

    it('should rank matches by score (coverage * confidence)', async () => {
      await proceduralMemory.add({
        id: 'p1',
        trigger: 'n8n webhook error',
        response: 'Check token param',
        confidence: 0.9
      })
      await proceduralMemory.add({
        id: 'p2',
        trigger: 'telegram bot error',
        response: 'Check bot token',
        confidence: 0.8
      })

      const result = await proceduralMemory.match('I got an error with n8n webhook')

      expect(result[0].id).toBe('p1')
      expect(result[0].score).toBeGreaterThan(result[1].score)
    })

    it('should be case-insensitive', async () => {
      await proceduralMemory.add({
        id: 'p1',
        trigger: 'N8N Webhook',
        response: 'Check token',
        confidence: 0.8
      })

      const result = await proceduralMemory.match('n8n webhook issue')

      expect(result).toHaveLength(1)
    })
  })

  describe('add', () => {
    it('should add a valid pattern and persist', async () => {
      await proceduralMemory.add({
        id: 'pattern-1',
        trigger: 'n8n webhook',
        response: 'Use ?token= param for auth',
        confidence: 0.9,
        learnedFrom: 'episode-123'
      })

      const patterns = await proceduralMemory.getAll()
      expect(patterns).toHaveLength(1)
      expect(patterns[0]).toMatchObject({
        id: 'pattern-1',
        trigger: 'n8n webhook',
        response: 'Use ?token= param for auth',
        confidence: 0.9,
        learnedFrom: 'episode-123',
        usageCount: 0
      })
      expect(patterns[0].createdAt).toBeDefined()
      expect(mockStore.writePatterns).toHaveBeenCalled()
    })

    it('should throw error if missing required fields', async () => {
      await expect(
        proceduralMemory.add({
          id: 'pattern-1',
          trigger: 'test'
          // Missing response
        })
      ).rejects.toThrow('Pattern must have id, trigger, and response')
    })

    it('should throw error if confidence is invalid', async () => {
      await expect(
        proceduralMemory.add({
          id: 'pattern-1',
          trigger: 'test',
          response: 'action',
          confidence: 1.5 // Invalid: > 1
        })
      ).rejects.toThrow('Pattern confidence must be a number between 0 and 1')
    })

    it('should throw error if confidence is negative', async () => {
      await expect(
        proceduralMemory.add({
          id: 'pattern-1',
          trigger: 'test',
          response: 'action',
          confidence: -0.1
        })
      ).rejects.toThrow('Pattern confidence must be a number between 0 and 1')
    })

    it('should default usageCount to 0', async () => {
      await proceduralMemory.add({
        id: 'pattern-1',
        trigger: 'test',
        response: 'action',
        confidence: 0.5
      })

      const patterns = await proceduralMemory.getAll()
      expect(patterns[0].usageCount).toBe(0)
    })
  })

  describe('remove', () => {
    it('should remove existing pattern and persist', async () => {
      await proceduralMemory.add({
        id: 'pattern-1',
        trigger: 'test',
        response: 'action',
        confidence: 0.5
      })

      vi.clearAllMocks()
      const removed = await proceduralMemory.remove('pattern-1')

      expect(removed).toBe(true)
      const patterns = await proceduralMemory.getAll()
      expect(patterns).toHaveLength(0)
      expect(mockStore.writePatterns).toHaveBeenCalled()
    })

    it('should return false for non-existent pattern', async () => {
      const removed = await proceduralMemory.remove('non-existent')

      expect(removed).toBe(false)
    })

    it('should only remove specified pattern', async () => {
      await proceduralMemory.add({
        id: 'pattern-1',
        trigger: 'test1',
        response: 'action1',
        confidence: 0.5
      })
      await proceduralMemory.add({
        id: 'pattern-2',
        trigger: 'test2',
        response: 'action2',
        confidence: 0.5
      })

      await proceduralMemory.remove('pattern-1')

      const patterns = await proceduralMemory.getAll()
      expect(patterns).toHaveLength(1)
      expect(patterns[0].id).toBe('pattern-2')
    })
  })

  describe('persistence', () => {
    it('should load patterns from store and merge with runtime adds', async () => {
      const storedPatterns = [
        { id: 'stored-1', trigger: 'old pattern', response: 'old action', confidence: 0.7, usageCount: 5, createdAt: '2025-01-01' }
      ]
      mockStore.readPatterns.mockResolvedValue(storedPatterns)

      await proceduralMemory.add({
        id: 'new-1',
        trigger: 'new pattern',
        response: 'new action',
        confidence: 0.6
      })

      const all = await proceduralMemory.getAll()
      expect(all).toHaveLength(2)
      expect(all[0].id).toBe('stored-1')
      expect(all[1].id).toBe('new-1')
    })
  })
})
