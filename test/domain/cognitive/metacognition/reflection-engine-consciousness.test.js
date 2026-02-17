import ReflectionEngine from '../../../../src/domain/cognitive/metacognition/reflection-engine.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('ReflectionEngine — consciousness integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('reflectEnhanced', () => {
    it('uses consciousness reflection when available', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          insights: ['Learning rate is healthy at 2 facts per 5 episodes', 'Error patterns suggest network instability'],
          adjustments: [{ type: 'monitoring', suggestion: 'Add network health check to watchdog' }]
        })
      }
      const engine = new ReflectionEngine({ consciousness: mockConsciousness })

      const result = await engine.reflectEnhanced({
        consolidation: { episodesProcessed: 5, factsAdded: 2, patternsAdded: 1 },
        errorAnalysis: { errorsFound: 3, lessonsExtracted: 1 },
        pruning: { workingPruned: 0, patternsPruned: 0 }
      })

      expect(result.insights).toHaveLength(2)
      expect(result.adjustments).toHaveLength(1)
      expect(result.adjustments[0].type).toBe('monitoring')
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'strategist',
        'generate_reflection',
        expect.objectContaining({ summary: expect.any(String) })
      )
    })

    it('falls back to heuristic when consciousness returns null', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue(null)
      }
      const engine = new ReflectionEngine({ consciousness: mockConsciousness })

      const result = await engine.reflectEnhanced({
        consolidation: { episodesProcessed: 10, factsAdded: 8, patternsAdded: 0 }
      })

      // Heuristic should detect high learning rate
      expect(result.insights.length).toBeGreaterThan(0)
    })

    it('falls back when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('timeout'))
      }
      const engine = new ReflectionEngine({ consciousness: mockConsciousness })

      const result = await engine.reflectEnhanced({
        consolidation: { episodesProcessed: 5, factsAdded: 6, patternsAdded: 0 }
      })

      expect(result).toHaveProperty('insights')
      expect(result).toHaveProperty('adjustments')
    })

    it('uses heuristic when no consciousness provided', async () => {
      const engine = new ReflectionEngine()

      const result = await engine.reflectEnhanced({
        consolidation: { episodesProcessed: 20, factsAdded: 1, patternsAdded: 0 }
      })

      // Low effectiveness heuristic should fire
      expect(result.insights.some(i => i.includes('low'))).toBe(true)
    })

    it('filters out invalid insights and adjustments', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          insights: ['valid insight', '', 123, 'another valid one'],
          adjustments: [
            { type: 'valid', suggestion: 'do something' },
            { noType: 'invalid' },
            { type: 'also_valid', suggestion: 'do another thing' }
          ]
        })
      }
      const engine = new ReflectionEngine({ consciousness: mockConsciousness })

      const result = await engine.reflectEnhanced({})

      expect(result.insights).toEqual(['valid insight', 'another valid one'])
      expect(result.adjustments).toHaveLength(2)
    })

    it('falls back when consciousness returns invalid structure', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          insights: 'not an array'
        })
      }
      const engine = new ReflectionEngine({ consciousness: mockConsciousness })

      const result = await engine.reflectEnhanced({
        consolidation: { factsAdded: 10, episodesProcessed: 5 }
      })

      // Falls back to heuristic
      expect(result).toHaveProperty('insights')
      expect(Array.isArray(result.insights)).toBe(true)
    })
  })
})
