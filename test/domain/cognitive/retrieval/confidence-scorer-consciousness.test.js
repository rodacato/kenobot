import ConfidenceScorer from '../../../../src/domain/cognitive/retrieval/confidence-scorer.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('ConfidenceScorer — consciousness integration', () => {
  const results = {
    facts: [
      { content: 'User prefers dark mode', score: 4 },
      { content: 'User works with Node.js', score: 3 }
    ],
    procedures: [],
    episodes: [
      { content: 'Discussed theme settings yesterday', score: 2 }
    ]
  }

  describe('scoreEnhanced', () => {
    it('uses consciousness to evaluate relevance', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          level: 'high',
          score: 0.9,
          reason: 'Results directly address dark mode preferences'
        })
      }

      const scorer = new ConfidenceScorer({ consciousness: mockConsciousness })
      const result = await scorer.scoreEnhanced(results, 'what theme do I prefer?')

      expect(result.level).toBe('high')
      expect(result.score).toBe(0.9)
      expect(result.metadata.consciousnessReason).toContain('dark mode')
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'semantic-analyst',
        'evaluate_confidence',
        expect.objectContaining({
          query: 'what theme do I prefer?'
        })
      )
    })

    it('preserves heuristic breakdown in enhanced result', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          level: 'medium',
          score: 0.6,
          reason: 'Partially relevant'
        })
      }

      const scorer = new ConfidenceScorer({ consciousness: mockConsciousness })
      const result = await scorer.scoreEnhanced(results, 'test query')

      expect(result.breakdown).toBeDefined()
      expect(result.metadata.totalResults).toBe(3)
      expect(result.metadata.counts.facts).toBe(2)
    })

    it('falls back to heuristic when no consciousness provided', async () => {
      const scorer = new ConfidenceScorer()
      const result = await scorer.scoreEnhanced(results, 'test query')

      expect(result.level).toBe('medium')
      expect(result.metadata.consciousnessReason).toBeUndefined()
    })

    it('falls back to heuristic when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('CLI timeout'))
      }

      const scorer = new ConfidenceScorer({ consciousness: mockConsciousness })
      const result = await scorer.scoreEnhanced(results, 'test query')

      expect(result.level).toBe('medium')
      expect(result.metadata.consciousnessReason).toBeUndefined()
    })

    it('falls back when consciousness returns invalid level', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          level: 'ultra',
          score: 0.9,
          reason: 'test'
        })
      }

      const scorer = new ConfidenceScorer({ consciousness: mockConsciousness })
      const result = await scorer.scoreEnhanced(results, 'test query')

      expect(result.level).toBe('medium')
    })

    it('falls back when consciousness returns non-numeric score', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          level: 'high',
          score: 'very high',
          reason: 'test'
        })
      }

      const scorer = new ConfidenceScorer({ consciousness: mockConsciousness })
      const result = await scorer.scoreEnhanced(results, 'test query')

      expect(result.level).toBe('medium')
    })

    it('returns heuristic directly when no results', async () => {
      const mockConsciousness = { evaluate: vi.fn() }

      const scorer = new ConfidenceScorer({ consciousness: mockConsciousness })
      const result = await scorer.scoreEnhanced(
        { facts: [], procedures: [], episodes: [] },
        'test query'
      )

      expect(result.level).toBe('none')
      expect(mockConsciousness.evaluate).not.toHaveBeenCalled()
    })

    it('clamps score to 0-1 range', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          level: 'high',
          score: 1.5,
          reason: 'test'
        })
      }

      const scorer = new ConfidenceScorer({ consciousness: mockConsciousness })
      const result = await scorer.scoreEnhanced(results, 'test query')

      expect(result.score).toBeLessThanOrEqual(1)
    })
  })
})
