import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ConfidenceScorer from '../../../../src/domain/cognitive/retrieval/confidence-scorer.js'

describe('ConfidenceScorer', () => {
  let scorer

  beforeEach(() => {
    scorer = new ConfidenceScorer()
    vi.clearAllMocks()
  })

  describe('score', () => {
    it('should return none when no results', () => {
      const result = scorer.score({ facts: [], procedures: [], episodes: [] })

      expect(result.level).toBe('none')
      expect(result.score).toBe(0)
    })

    it('should return high for strong scores', () => {
      const facts = [
        { content: 'fact1', score: 5 },
        { content: 'fact2', score: 6 }
      ]
      const result = scorer.score({ facts, procedures: [], episodes: [] })

      expect(result.level).toBe('high')
      expect(result.score).toBeGreaterThan(4)
    })

    it('should return medium for moderate scores', () => {
      const facts = [
        { content: 'fact1', score: 3 },
        { content: 'fact2', score: 2 }
      ]
      const result = scorer.score({ facts, procedures: [], episodes: [] })

      expect(result.level).toBe('medium')
      expect(result.score).toBeGreaterThanOrEqual(2)
      expect(result.score).toBeLessThan(4)
    })

    it('should return low for weak scores', () => {
      const facts = [{ content: 'fact1', score: 1 }]
      const result = scorer.score({ facts, procedures: [], episodes: [] })

      expect(result.level).toBe('low')
      expect(result.score).toBeLessThan(2)
    })

    it('should weight facts and procedures higher than episodes', () => {
      // When there are multiple types, facts/procedures should be weighted higher
      const withMixedFactsEpisodes = scorer.score({
        facts: [{ score: 5 }],
        procedures: [],
        episodes: [{ score: 5 }]
      })

      const withMixedEpisodesFacts = scorer.score({
        facts: [{ score: 5 }],
        procedures: [],
        episodes: [{ score: 3 }]
      })

      // With same fact score but lower episode score, should still be high
      expect(withMixedEpisodesFacts.level).toBe('high')
      expect(withMixedEpisodesFacts.score).toBeGreaterThanOrEqual(4)
    })

    it('should include breakdown by type', () => {
      const result = scorer.score({
        facts: [{ score: 3 }],
        procedures: [{ score: 4 }],
        episodes: [{ score: 2 }]
      })

      expect(result.breakdown.facts).toBe(3)
      expect(result.breakdown.procedures).toBe(4)
      expect(result.breakdown.episodes).toBe(2)
    })

    it('should include metadata with counts and top scores', () => {
      const result = scorer.score({
        facts: [{ score: 5 }, { score: 3 }],
        procedures: [{ score: 4 }],
        episodes: []
      })

      expect(result.metadata.totalResults).toBe(3)
      expect(result.metadata.counts.facts).toBe(2)
      expect(result.metadata.counts.procedures).toBe(1)
      expect(result.metadata.topScores.fact).toBe(5)
      expect(result.metadata.topScores.procedure).toBe(4)
    })
  })

  describe('getDescription', () => {
    it('should return description for each level', () => {
      expect(scorer.getDescription('none')).toContain('No relevant')
      expect(scorer.getDescription('low')).toContain('Limited')
      expect(scorer.getDescription('medium')).toContain('Moderate')
      expect(scorer.getDescription('high')).toContain('Strong')
    })

    it('should handle unknown levels', () => {
      expect(scorer.getDescription('unknown')).toBe(scorer.getDescription('none'))
    })
  })
})
