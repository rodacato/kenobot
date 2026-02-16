import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ReflectionEngine from '../../../../src/domain/cognitive/metacognition/reflection-engine.js'

describe('ReflectionEngine', () => {
  let engine

  beforeEach(() => {
    engine = new ReflectionEngine()
    vi.clearAllMocks()
  })

  describe('reflect', () => {
    it('should return insights and adjustments', () => {
      const result = engine.reflect({})

      expect(result).toHaveProperty('insights')
      expect(result).toHaveProperty('adjustments')
      expect(Array.isArray(result.insights)).toBe(true)
      expect(Array.isArray(result.adjustments)).toBe(true)
    })

    it('should detect high learning rate', () => {
      const result = engine.reflect({
        consolidation: { factsAdded: 8, episodesProcessed: 10 }
      })

      const learningInsight = result.insights.find(i => i.includes('learning rate'))
      expect(learningInsight).toBeTruthy()
      expect(learningInsight).toContain('8 new facts')
    })

    it('should not flag normal learning rate', () => {
      const result = engine.reflect({
        consolidation: { factsAdded: 3, episodesProcessed: 5 }
      })

      const learningInsight = result.insights.find(i => i.includes('learning rate'))
      expect(learningInsight).toBeUndefined()
    })

    it('should detect errors without lessons', () => {
      const result = engine.reflect({
        errorAnalysis: { errorsFound: 3, lessonsExtracted: 0 }
      })

      const errorInsight = result.insights.find(i => i.includes('no lessons'))
      expect(errorInsight).toBeTruthy()

      const errorAdj = result.adjustments.find(a => a.type === 'error_handling')
      expect(errorAdj).toBeTruthy()
    })

    it('should not flag errors with lessons', () => {
      const result = engine.reflect({
        errorAnalysis: { errorsFound: 3, lessonsExtracted: 2 }
      })

      const errorInsight = result.insights.find(i => i.includes('no lessons'))
      expect(errorInsight).toBeUndefined()
    })

    it('should detect low consolidation effectiveness', () => {
      const result = engine.reflect({
        consolidation: { episodesProcessed: 20, factsAdded: 0, patternsAdded: 1 }
      })

      const effectivenessInsight = result.insights.find(i => i.includes('effectiveness'))
      expect(effectivenessInsight).toBeTruthy()

      const taggingAdj = result.adjustments.find(a => a.type === 'memory_tagging')
      expect(taggingAdj).toBeTruthy()
    })

    it('should not flag normal effectiveness', () => {
      const result = engine.reflect({
        consolidation: { episodesProcessed: 10, factsAdded: 3, patternsAdded: 2 }
      })

      const effectivenessInsight = result.insights.find(i => i.includes('effectiveness'))
      expect(effectivenessInsight).toBeUndefined()
    })

    it('should detect memory churn', () => {
      const result = engine.reflect({
        consolidation: { patternsAdded: 1 },
        pruning: { patternsPruned: 5 }
      })

      const churnInsight = result.insights.find(i => i.includes('pruned than added'))
      expect(churnInsight).toBeTruthy()

      const qualityAdj = result.adjustments.find(a => a.type === 'pattern_quality')
      expect(qualityAdj).toBeTruthy()
    })

    it('should not flag when adding more than pruning', () => {
      const result = engine.reflect({
        consolidation: { patternsAdded: 5 },
        pruning: { patternsPruned: 2 }
      })

      const churnInsight = result.insights.find(i => i.includes('pruned than added'))
      expect(churnInsight).toBeUndefined()
    })

    it('should handle empty sleep results', () => {
      const result = engine.reflect({})

      expect(result.insights).toEqual([])
      expect(result.adjustments).toEqual([])
    })

    it('should handle undefined sleep results', () => {
      const result = engine.reflect()

      expect(result.insights).toEqual([])
      expect(result.adjustments).toEqual([])
    })

    it('should combine multiple insights', () => {
      const result = engine.reflect({
        consolidation: { factsAdded: 8, episodesProcessed: 100, patternsAdded: 0 },
        errorAnalysis: { errorsFound: 5, lessonsExtracted: 0 },
        pruning: { patternsPruned: 3 }
      })

      expect(result.insights.length).toBeGreaterThanOrEqual(3)
    })
  })
})
