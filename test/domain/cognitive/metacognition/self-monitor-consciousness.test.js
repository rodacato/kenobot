import SelfMonitor from '../../../../src/domain/cognitive/metacognition/self-monitor.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('SelfMonitor — consciousness integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('evaluateEnhanced', () => {
    it('uses consciousness evaluation when available', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          quality: 'good',
          signals: ['clear', 'relevant'],
          score: 0.92
        })
      }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      const result = await monitor.evaluateEnhanced(
        'Here is a detailed explanation of how the system works with examples.',
        { userMessage: 'How does the system work?' }
      )

      expect(result.quality).toBe('good')
      expect(result.signals).toEqual(['clear', 'relevant'])
      expect(result.score).toBe(0.92)
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'quality-reviewer',
        'evaluate_response',
        expect.objectContaining({
          response: expect.any(String),
          userMessage: expect.any(String)
        })
      )
    })

    it('falls back to heuristic when consciousness returns null', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue(null)
      }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      const result = await monitor.evaluateEnhanced(
        'This is a good response with enough content to evaluate.',
        { userMessage: 'Tell me something' }
      )

      // Heuristic result
      expect(result.quality).toBe('good')
      expect(result.score).toBeGreaterThan(0)
    })

    it('falls back when consciousness returns invalid quality', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          quality: 'excellent', // Invalid — not good/uncertain/poor
          signals: [],
          score: 0.9
        })
      }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      const result = await monitor.evaluateEnhanced(
        'A perfectly fine response that is long enough.',
        { userMessage: 'Question' }
      )

      // Falls back to heuristic
      expect(['good', 'uncertain', 'poor']).toContain(result.quality)
    })

    it('falls back when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('timeout'))
      }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      const result = await monitor.evaluateEnhanced(
        'A valid response to evaluate.',
        { userMessage: 'What is this?' }
      )

      expect(result).toHaveProperty('quality')
      expect(result).toHaveProperty('score')
      expect(result).toHaveProperty('signals')
    })

    it('uses heuristic when no consciousness provided', async () => {
      const monitor = new SelfMonitor()

      const result = await monitor.evaluateEnhanced(
        'A perfectly valid response.',
        { userMessage: 'Tell me' }
      )

      expect(result.quality).toBe('good')
    })

    it('uses heuristic for very short responses without calling consciousness', async () => {
      const mockConsciousness = { evaluate: vi.fn() }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      const result = await monitor.evaluateEnhanced('ok', {})

      expect(result.quality).toBe('poor')
      expect(mockConsciousness.evaluate).not.toHaveBeenCalled()
    })

    it('truncates long inputs for consciousness', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          quality: 'good',
          signals: [],
          score: 0.8
        })
      }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      await monitor.evaluateEnhanced(
        'x'.repeat(5000),
        { userMessage: 'y'.repeat(3000) }
      )

      const call = mockConsciousness.evaluate.mock.calls[0][2]
      expect(call.response.length).toBeLessThanOrEqual(1000)
      expect(call.userMessage.length).toBeLessThanOrEqual(500)
    })

    it('clamps score to 0-1 range', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          quality: 'good',
          signals: [],
          score: 1.5
        })
      }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      const result = await monitor.evaluateEnhanced(
        'A response to evaluate for quality.',
        { userMessage: 'Question' }
      )

      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('consciousness detects subtle quality issues heuristic misses', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          quality: 'poor',
          signals: ['off_topic', 'factually_incorrect'],
          score: 0.2
        })
      }
      const monitor = new SelfMonitor({ consciousness: mockConsciousness })

      // This response looks fine to heuristics (not short, no hedging, no repetition)
      // but consciousness detects it's off-topic
      const result = await monitor.evaluateEnhanced(
        'The weather today is sunny with clear skies and mild temperatures expected throughout the day.',
        { userMessage: 'How do I fix the database connection error?' }
      )

      expect(result.quality).toBe('poor')
      expect(result.signals).toContain('off_topic')
    })
  })
})
