import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import MetacognitionSystem from '../../../../src/domain/cognitive/metacognition/index.js'

describe('MetacognitionSystem', () => {
  let metacognition

  beforeEach(() => {
    metacognition = new MetacognitionSystem()
    vi.clearAllMocks()
  })

  describe('construction', () => {
    it('should initialize all sub-components', () => {
      expect(metacognition.selfMonitor).toBeDefined()
      expect(metacognition.confidenceEstimator).toBeDefined()
      expect(metacognition.reflectionEngine).toBeDefined()
    })
  })

  describe('evaluateResponse', () => {
    it('should delegate to SelfMonitor', () => {
      const result = metacognition.evaluateResponse(
        'Here is a detailed and helpful response to your question.',
        { userMessage: 'How does this work?' }
      )

      expect(result).toHaveProperty('quality')
      expect(result).toHaveProperty('signals')
      expect(result).toHaveProperty('score')
    })

    it('should detect poor quality', () => {
      const result = metacognition.evaluateResponse('', {})

      expect(result.quality).toBe('poor')
    })

    it('should work without context', () => {
      const result = metacognition.evaluateResponse(
        'A response that is long enough to be considered valid.'
      )

      expect(result.quality).toBe('good')
    })
  })

  describe('estimateConfidence', () => {
    it('should delegate to ConfidenceEstimator', () => {
      const result = metacognition.estimateConfidence({
        confidence: { level: 'high', score: 0.9 },
        facts: [{ content: 'fact' }],
        procedures: [],
        episodes: []
      })

      expect(result).toHaveProperty('level')
      expect(result).toHaveProperty('score')
      expect(result).toHaveProperty('reason')
    })

    it('should handle null input', () => {
      const result = metacognition.estimateConfidence(null)

      expect(result.level).toBe('low')
    })
  })

  describe('reflect', () => {
    it('should delegate to ReflectionEngine', () => {
      const result = metacognition.reflect({
        consolidation: { factsAdded: 8, episodesProcessed: 10 }
      })

      expect(result).toHaveProperty('insights')
      expect(result).toHaveProperty('adjustments')
    })

    it('should handle empty results', () => {
      const result = metacognition.reflect({})

      expect(result.insights).toEqual([])
      expect(result.adjustments).toEqual([])
    })
  })
})
