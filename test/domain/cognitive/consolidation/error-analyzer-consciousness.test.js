import ErrorAnalyzer from '../../../../src/domain/cognitive/consolidation/error-analyzer.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('ErrorAnalyzer — consciousness integration', () => {
  let mockMemory

  beforeEach(() => {
    vi.clearAllMocks()
    mockMemory = {
      getRecentDays: vi.fn().mockResolvedValue(''),
      addFact: vi.fn().mockResolvedValue(undefined)
    }
  })

  describe('classifyErrorEnhanced', () => {
    it('uses consciousness classification when available', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          category: 'external',
          confidence: 0.95
        })
      }
      const analyzer = new ErrorAnalyzer(mockMemory, { consciousness: mockConsciousness })

      const result = await analyzer.classifyErrorEnhanced('ECONNREFUSED connecting to database')

      expect(result).toBe('external')
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'reliability-engineer',
        'classify_error',
        expect.objectContaining({ errorMessage: expect.stringContaining('ECONNREFUSED') })
      )
    })

    it('falls back to heuristic when consciousness returns null', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue(null)
      }
      const analyzer = new ErrorAnalyzer(mockMemory, { consciousness: mockConsciousness })

      const result = await analyzer.classifyErrorEnhanced('network timeout error')

      // Heuristic: .includes('network') || .includes('timeout') → external
      expect(result).toBe('external')
    })

    it('falls back to heuristic when consciousness returns invalid category', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          category: 'banana', // Invalid category
          confidence: 0.8
        })
      }
      const analyzer = new ErrorAnalyzer(mockMemory, { consciousness: mockConsciousness })

      const result = await analyzer.classifyErrorEnhanced('config missing')

      // Heuristic: .includes('config') || .includes('missing') → configuration
      expect(result).toBe('configuration')
    })

    it('uses heuristic when no consciousness provided', async () => {
      const analyzer = new ErrorAnalyzer(mockMemory)

      const result = await analyzer.classifyErrorEnhanced('invalid user input')

      // Heuristic: .includes('invalid') → user
      expect(result).toBe('user')
    })

    it('truncates long error messages for consciousness', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          category: 'internal',
          confidence: 0.7
        })
      }
      const analyzer = new ErrorAnalyzer(mockMemory, { consciousness: mockConsciousness })
      const longError = 'x'.repeat(1000)

      await analyzer.classifyErrorEnhanced(longError)

      const passedMessage = mockConsciousness.evaluate.mock.calls[0][2].errorMessage
      expect(passedMessage.length).toBeLessThanOrEqual(500)
    })

    it('consciousness detects subtle context that heuristic misses', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          category: 'internal',
          confidence: 0.9
        })
      }
      const analyzer = new ErrorAnalyzer(mockMemory, { consciousness: mockConsciousness })

      // "undefined" triggers heuristic → configuration, but consciousness sees it's a code bug
      const result = await analyzer.classifyErrorEnhanced(
        'TypeError: Cannot read properties of undefined (reading "map")'
      )

      expect(result).toBe('internal') // Consciousness is smarter
    })

    it('heuristic would misclassify the same error as configuration', () => {
      const analyzer = new ErrorAnalyzer(mockMemory)

      const result = analyzer.classifyError(
        'TypeError: Cannot read properties of undefined (reading "map")'
      )

      // Heuristic sees "undefined" → configuration (wrong!)
      expect(result).toBe('configuration')
    })
  })

  describe('run() with consciousness', () => {
    it('uses enhanced classification in run()', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          category: 'internal',
          confidence: 0.8
        })
      }
      mockMemory.getRecentDays.mockResolvedValue(
        '## 14:32 — Error: null pointer exception in handler\nCrash occurred'
      )

      const analyzer = new ErrorAnalyzer(mockMemory, { consciousness: mockConsciousness })
      const result = await analyzer.run()

      expect(result.errorsFound).toBe(1)
      expect(mockConsciousness.evaluate).toHaveBeenCalled()
    })
  })
})
