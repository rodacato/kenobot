import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import WorkingMemory from '../../../src/cognitive/memory/working-memory.js'

describe('WorkingMemory', () => {
  let workingMemory
  let mockStore

  beforeEach(() => {
    mockStore = {
      getWorkingMemory: vi.fn(),
      writeWorkingMemory: vi.fn().mockResolvedValue(undefined)
    }

    workingMemory = new WorkingMemory(mockStore, { staleThreshold: 7 })
    vi.clearAllMocks()
  })

  describe('get', () => {
    it('should return working memory content', async () => {
      mockStore.getWorkingMemory.mockResolvedValue({
        content: 'Current task: testing',
        updatedAt: Date.now()
      })

      const result = await workingMemory.get('session-123')

      expect(result).toEqual({
        content: 'Current task: testing',
        updatedAt: expect.any(Number)
      })
      expect(mockStore.getWorkingMemory).toHaveBeenCalledWith('session-123')
    })

    it('should return null for non-existent memory', async () => {
      mockStore.getWorkingMemory.mockResolvedValue(null)

      const result = await workingMemory.get('session-123')

      expect(result).toBeNull()
    })

    it('should return null for stale memory (> 7 days)', async () => {
      const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000)
      mockStore.getWorkingMemory.mockResolvedValue({
        content: 'Old task',
        updatedAt: eightDaysAgo
      })

      const result = await workingMemory.get('session-123')

      expect(result).toBeNull()
    })

    it('should return fresh memory unchanged', async () => {
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000)
      mockStore.getWorkingMemory.mockResolvedValue({
        content: 'Recent task',
        updatedAt: threeDaysAgo
      })

      const result = await workingMemory.get('session-123')

      expect(result).toEqual({
        content: 'Recent task',
        updatedAt: threeDaysAgo
      })
    })
  })

  describe('replace', () => {
    it('should write new working memory', async () => {
      await workingMemory.replace('session-123', 'New task content')

      expect(mockStore.writeWorkingMemory).toHaveBeenCalledWith('session-123', 'New task content')
    })

    it('should handle empty content', async () => {
      await workingMemory.replace('session-123', '')

      expect(mockStore.writeWorkingMemory).toHaveBeenCalledWith('session-123', '')
    })
  })

  describe('clear', () => {
    it('should clear working memory', async () => {
      await workingMemory.clear('session-123')

      expect(mockStore.writeWorkingMemory).toHaveBeenCalledWith('session-123', '')
    })
  })

  describe('exists', () => {
    it('should return true when memory exists', async () => {
      mockStore.getWorkingMemory.mockResolvedValue({
        content: 'Some content',
        updatedAt: Date.now()
      })

      const result = await workingMemory.exists('session-123')

      expect(result).toBe(true)
    })

    it('should return false when memory does not exist', async () => {
      mockStore.getWorkingMemory.mockResolvedValue(null)

      const result = await workingMemory.exists('session-123')

      expect(result).toBe(false)
    })

    it('should return false when memory is empty', async () => {
      mockStore.getWorkingMemory.mockResolvedValue({
        content: '',
        updatedAt: Date.now()
      })

      const result = await workingMemory.exists('session-123')

      expect(result).toBe(false)
    })
  })
})
