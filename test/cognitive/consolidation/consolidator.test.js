import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import Consolidator from '../../../src/cognitive/consolidation/consolidator.js'

describe('Consolidator', () => {
  let consolidator
  let mockMemory

  beforeEach(() => {
    mockMemory = {}
    consolidator = new Consolidator(mockMemory)
    vi.clearAllMocks()
  })

  describe('run', () => {
    it('should return consolidation results', async () => {
      const result = await consolidator.run()

      expect(result).toHaveProperty('episodesProcessed')
      expect(result).toHaveProperty('patternsAdded')
      expect(result).toHaveProperty('factsAdded')
    })
  })

  describe('scoreSalience', () => {
    it('should score errors as salient', () => {
      const score = consolidator.scoreSalience('An error occurred while processing')

      expect(score).toBeGreaterThan(0)
    })

    it('should score successes as salient', () => {
      const score = consolidator.scoreSalience('Successfully solved the problem')

      expect(score).toBeGreaterThan(0)
    })

    it('should score corrections as highly salient', () => {
      const score = consolidator.scoreSalience('Actually, the correct approach is...')

      expect(score).toBeGreaterThanOrEqual(0.5)
    })

    it('should score novel situations as salient', () => {
      const score = consolidator.scoreSalience('This is a new type of request')

      expect(score).toBeGreaterThan(0)
    })

    it('should cap salience at 1.0', () => {
      const score = consolidator.scoreSalience('Error: new situation that actually failed successfully')

      expect(score).toBeLessThanOrEqual(1.0)
    })

    it('should return low score for mundane episodes', () => {
      const score = consolidator.scoreSalience('Regular conversation about weather')

      expect(score).toBe(0)
    })
  })

  describe('extractPattern', () => {
    it('should return null for placeholder', () => {
      const pattern = consolidator.extractPattern(['episode 1', 'episode 2'])

      expect(pattern).toBeNull()
    })
  })

  describe('extractFacts', () => {
    it('should return empty array for placeholder', () => {
      const facts = consolidator.extractFacts(['episode 1'])

      expect(facts).toEqual([])
    })
  })
})
