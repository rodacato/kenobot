import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ConfidenceEstimator from '../../../../src/domain/cognitive/metacognition/confidence-estimator.js'

describe('ConfidenceEstimator', () => {
  let estimator

  beforeEach(() => {
    estimator = new ConfidenceEstimator()
    vi.clearAllMocks()
  })

  describe('estimate', () => {
    it('should return low confidence when no retrieval data', () => {
      const result = estimator.estimate(null)

      expect(result.level).toBe('low')
      expect(result.score).toBe(0.2)
      expect(result.reason).toContain('No retrieval data')
    })

    it('should use retrieval confidence when available', () => {
      const result = estimator.estimate({
        confidence: { level: 'high', score: 0.85 },
        facts: [{ content: 'fact1' }, { content: 'fact2' }],
        procedures: [],
        episodes: []
      })

      expect(result.level).toBe('high')
      expect(result.score).toBeGreaterThanOrEqual(0.8)
      expect(result.reason).toContain('high')
    })

    it('should boost score when many results found', () => {
      const manyFacts = Array.from({ length: 6 }, (_, i) => ({ content: `fact${i}` }))

      const result = estimator.estimate({
        confidence: { level: 'medium', score: 0.5 },
        facts: manyFacts,
        procedures: [],
        episodes: []
      })

      expect(result.score).toBeGreaterThan(0.5)
      expect(result.reason).toContain('6 results')
    })

    it('should penalize when no results found', () => {
      const result = estimator.estimate({
        confidence: { level: 'medium', score: 0.5 },
        facts: [],
        procedures: [],
        episodes: []
      })

      expect(result.score).toBeLessThan(0.5)
      expect(result.reason).toContain('no results')
    })

    it('should cap score at 1.0', () => {
      const manyFacts = Array.from({ length: 10 }, (_, i) => ({ content: `fact${i}` }))

      const result = estimator.estimate({
        confidence: { level: 'high', score: 0.95 },
        facts: manyFacts,
        procedures: [],
        episodes: []
      })

      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('should not go below 0', () => {
      const result = estimator.estimate({
        confidence: { level: 'low', score: 0.1 },
        facts: [],
        procedures: [],
        episodes: []
      })

      expect(result.score).toBeGreaterThanOrEqual(0)
    })

    it('should estimate from fact count when no confidence metadata', () => {
      const result = estimator.estimate({
        facts: [{ content: 'f1' }, { content: 'f2' }, { content: 'f3' }]
      })

      expect(result.level).toBe('medium')
      expect(result.reason).toContain('3 retrieved facts')
    })

    it('should return low confidence when no facts and no metadata', () => {
      const result = estimator.estimate({ facts: [] })

      expect(result.level).toBe('low')
      expect(result.score).toBe(0.2)
    })

    it('should return high confidence with many facts and no metadata', () => {
      const manyFacts = Array.from({ length: 6 }, (_, i) => ({ content: `fact${i}` }))

      const result = estimator.estimate({ facts: manyFacts })

      expect(result.level).toBe('high')
    })

    it('should count procedures and episodes in result count', () => {
      const result = estimator.estimate({
        confidence: { level: 'medium', score: 0.5 },
        facts: [{ content: 'f1' }],
        procedures: [{ trigger: 't1' }, { trigger: 't2' }],
        episodes: [{ content: 'e1' }, { content: 'e2' }, { content: 'e3' }]
      })

      expect(result.score).toBeGreaterThan(0.5)
      expect(result.reason).toContain('6 results')
    })

    it('should default score to 0.5 when confidence has no score', () => {
      const result = estimator.estimate({
        confidence: { level: 'medium' },
        facts: [{ content: 'f1' }],
        procedures: [],
        episodes: []
      })

      expect(result.score).toBeGreaterThanOrEqual(0.4)
    })
  })
})
