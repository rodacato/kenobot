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
    mockStore = {}
    proceduralMemory = new ProceduralMemory(mockStore)
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should return empty array initially', async () => {
      const result = await proceduralMemory.getAll()

      expect(result).toEqual([])
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
  })

  describe('match', () => {
    it('should return empty array (not implemented)', async () => {
      const result = await proceduralMemory.match('some message text')

      expect(result).toEqual([])
    })
  })

  describe('add', () => {
    it('should add a valid pattern', async () => {
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
    it('should remove existing pattern', async () => {
      await proceduralMemory.add({
        id: 'pattern-1',
        trigger: 'test',
        response: 'action',
        confidence: 0.5
      })

      const removed = await proceduralMemory.remove('pattern-1')

      expect(removed).toBe(true)
      const patterns = await proceduralMemory.getAll()
      expect(patterns).toHaveLength(0)
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
})
