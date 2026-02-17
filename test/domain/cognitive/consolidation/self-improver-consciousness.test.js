import SelfImprover from '../../../../src/domain/cognitive/consolidation/self-improver.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('SelfImprover — consciousness integration', () => {
  let mockMemory

  beforeEach(() => {
    vi.clearAllMocks()
    mockMemory = {}
  })

  describe('generateProposalsEnhanced', () => {
    it('uses consciousness proposals when available', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          insights: ['System is learning effectively'],
          suggestions: [
            {
              observation: 'Error classification accuracy could improve',
              suggestion: 'Add more error categories for database-specific failures',
              evidence: '3 database errors were all classified as generic internal',
              priority: 'medium'
            }
          ]
        })
      }
      const improver = new SelfImprover(mockMemory, { consciousness: mockConsciousness })

      const proposals = await improver.generateProposalsEnhanced({
        consolidation: { episodesProcessed: 5, patternsAdded: 1, factsAdded: 2 },
        errorAnalysis: { errorsFound: 3, lessonsExtracted: 1 },
        pruning: { workingPruned: 0, patternsPruned: 0 }
      })

      expect(proposals).toHaveLength(1)
      expect(proposals[0].observation).toBe('Error classification accuracy could improve')
      expect(proposals[0].priority).toBe('medium')
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'strategist',
        'analyze_sleep_results',
        expect.objectContaining({
          consolidation: expect.any(String),
          errorAnalysis: expect.any(String),
          pruning: expect.any(String)
        })
      )
    })

    it('falls back to heuristic when consciousness returns null', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue(null)
      }
      const improver = new SelfImprover(mockMemory, { consciousness: mockConsciousness })

      const proposals = await improver.generateProposalsEnhanced({
        consolidation: { episodesProcessed: 15, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
        pruning: { workingPruned: 0, patternsPruned: 0 }
      })

      // Heuristic: many episodes but no patterns → proposal
      expect(proposals.length).toBeGreaterThan(0)
    })

    it('falls back when consciousness returns invalid priorities', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          suggestions: [
            { observation: 'x', suggestion: 'y', priority: 'critical' } // invalid priority
          ]
        })
      }
      const improver = new SelfImprover(mockMemory, { consciousness: mockConsciousness })

      const proposals = await improver.generateProposalsEnhanced({
        errorAnalysis: { errorsFound: 5, lessonsExtracted: 0 }
      })

      // Falls back to heuristic
      expect(proposals.every(p => ['high', 'medium', 'low'].includes(p.priority))).toBe(true)
    })

    it('falls back when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('CLI crashed'))
      }
      const improver = new SelfImprover(mockMemory, { consciousness: mockConsciousness })

      const proposals = await improver.generateProposalsEnhanced({
        errorAnalysis: { errorsFound: 4, lessonsExtracted: 1 }
      })

      // Should not throw, uses heuristic
      expect(proposals).toBeInstanceOf(Array)
    })

    it('uses heuristic when no consciousness provided', async () => {
      const improver = new SelfImprover(mockMemory)

      const proposals = await improver.generateProposalsEnhanced({
        consolidation: { episodesProcessed: 20, patternsAdded: 0 }
      })

      expect(proposals.length).toBeGreaterThan(0)
    })

    it('adds default evidence when consciousness omits it', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          suggestions: [
            { observation: 'Something', suggestion: 'Do something', priority: 'low' }
            // No evidence field
          ]
        })
      }
      const improver = new SelfImprover(mockMemory, { consciousness: mockConsciousness })

      const proposals = await improver.generateProposalsEnhanced({})

      expect(proposals[0].evidence).toBe('Identified by consciousness analysis')
    })
  })

  describe('run() with consciousness', () => {
    it('uses enhanced proposal generation in run()', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          suggestions: [
            {
              observation: 'High error rate',
              suggestion: 'Add retry logic',
              priority: 'high'
            }
          ]
        })
      }
      const improver = new SelfImprover(mockMemory, { consciousness: mockConsciousness })

      const result = await improver.run({
        consolidation: { episodesProcessed: 5 },
        errorAnalysis: { errorsFound: 10 },
        pruning: {}
      })

      expect(result.proposalsGenerated).toBe(1)
      expect(mockConsciousness.evaluate).toHaveBeenCalled()
    })
  })
})
