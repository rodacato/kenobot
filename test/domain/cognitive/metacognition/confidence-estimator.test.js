import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
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

  describe('estimateEnhanced', () => {
    const retrievalWithConsciousness = {
      confidence: {
        level: 'high',
        score: 0.85,
        metadata: { consciousnessReason: 'Facts directly address the query about dark mode' }
      },
      facts: [{ content: 'User prefers dark mode', score: 4 }],
      procedures: [],
      episodes: []
    }

    const retrievalHeuristic = {
      confidence: { level: 'medium', score: 0.5, metadata: { totalResults: 1 } },
      facts: [{ content: 'User prefers dark mode', score: 4 }],
      procedures: [],
      episodes: []
    }

    it('promotes pre-computed consciousness result from ConfidenceScorer', async () => {
      const result = await estimator.estimateEnhanced(retrievalWithConsciousness, 'dark mode?')

      expect(result.level).toBe('high')
      expect(result.score).toBe(0.85)
      expect(result.reason).toContain('dark mode')
    })

    it('does not call consciousness when scorer already evaluated', async () => {
      const mockConsciousness = { evaluate: vi.fn() }
      const withConsciousness = new ConfidenceEstimator({ consciousness: mockConsciousness })

      await withConsciousness.estimateEnhanced(retrievalWithConsciousness, 'dark mode?')

      expect(mockConsciousness.evaluate).not.toHaveBeenCalled()
    })

    it('calls consciousness when scorer used heuristic only', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({ level: 'high', score: 0.9, reason: 'Very relevant' })
      }
      const withConsciousness = new ConfidenceEstimator({ consciousness: mockConsciousness })

      const result = await withConsciousness.estimateEnhanced(retrievalHeuristic, 'query')

      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'semantic-analyst',
        'evaluate_confidence',
        expect.objectContaining({ query: 'query' })
      )
      expect(result.level).toBe('high')
      expect(result.score).toBe(0.9)
    })

    it('falls back to heuristic when no consciousness provided', async () => {
      const result = await estimator.estimateEnhanced(retrievalHeuristic, 'query')

      expect(result.level).toBeDefined()
      expect(result.score).toBeDefined()
    })

    it('falls back to heuristic when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('timeout'))
      }
      const withConsciousness = new ConfidenceEstimator({ consciousness: mockConsciousness })

      const result = await withConsciousness.estimateEnhanced(retrievalHeuristic, 'query')

      expect(result.level).toBeDefined()
      expect(result.score).toBeDefined()
    })

    it('falls back to heuristic when consciousness returns invalid level', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({ level: 'ultra', score: 0.9, reason: 'test' })
      }
      const withConsciousness = new ConfidenceEstimator({ consciousness: mockConsciousness })

      const result = await withConsciousness.estimateEnhanced(retrievalHeuristic, 'query')

      expect(['none', 'low', 'medium', 'high']).toContain(result.level)
    })

    it('skips consciousness when no results', async () => {
      const mockConsciousness = { evaluate: vi.fn() }
      const withConsciousness = new ConfidenceEstimator({ consciousness: mockConsciousness })
      const empty = { confidence: { level: 'none', score: 0, metadata: {} }, facts: [], procedures: [], episodes: [] }

      await withConsciousness.estimateEnhanced(empty, 'query')

      expect(mockConsciousness.evaluate).not.toHaveBeenCalled()
    })

    it('clamps score to 0-1 range when promoted from scorer', async () => {
      const retrieval = {
        confidence: { level: 'high', score: 1.5, metadata: { consciousnessReason: 'test' } },
        facts: [{ content: 'f', score: 5 }],
        procedures: [],
        episodes: []
      }

      const result = await estimator.estimateEnhanced(retrieval, 'q')

      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('returns heuristic when retrieval result is null', async () => {
      const result = await estimator.estimateEnhanced(null)

      expect(result.level).toBe('low')
      expect(result.score).toBe(0.2)
    })
  })
})
