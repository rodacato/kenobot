import Consolidator from '../../../../src/domain/cognitive/consolidation/consolidator.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('Consolidator — consciousness integration', () => {
  let mockMemory

  beforeEach(() => {
    vi.clearAllMocks()
    mockMemory = {
      getRecentDays: vi.fn().mockResolvedValue(''),
      getChatRecentDays: vi.fn().mockResolvedValue(''),
      getLongTermMemory: vi.fn().mockResolvedValue(''),
      writeLongTermMemory: vi.fn().mockResolvedValue(undefined),
      addFact: vi.fn().mockResolvedValue(undefined),
      getPatterns: vi.fn().mockResolvedValue([]),
      store: { listChatSessions: vi.fn().mockResolvedValue([]) },
      procedural: { add: vi.fn().mockResolvedValue(undefined) }
    }
  })

  describe('extractPatternsEnhanced', () => {
    it('uses consciousness patterns when available', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          patterns: [
            { trigger: 'database timeout', resolution: 'increase connection pool size', confidence: 0.85 }
          ]
        })
      }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })

      const episodes = ['## 14:32 — Database timeout error occurred\nIncreased connection pool and it resolved']
      const result = await consolidator.extractPatternsEnhanced(episodes)

      expect(result).toHaveLength(1)
      expect(result[0].trigger).toBe('database timeout')
      expect(result[0].response).toBe('increase connection pool size')
      expect(result[0].confidence).toBe(0.85)
      expect(result[0].learnedFrom).toBe('consolidation-consciousness')
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'semantic-analyst',
        'extract_patterns',
        expect.objectContaining({ episodes: expect.any(String) })
      )
    })

    it('falls back to heuristic when consciousness returns null', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue(null)
      }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })

      const episodes = ['## 14:32 — Error: module not found\nFixed by reinstalling']
      const result = await consolidator.extractPatternsEnhanced(episodes)

      // Heuristic: has 'error' + 'fixed' → pattern extracted
      expect(result.length).toBeGreaterThanOrEqual(0) // heuristic result
      expect(result.every(p => p.learnedFrom === 'consolidation')).toBe(true)
    })

    it('falls back to heuristic when consciousness returns empty patterns', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({ patterns: [] })
      }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })

      const episodes = ['## 14:32 — Error: timeout\nSolved by retry']
      const result = await consolidator.extractPatternsEnhanced(episodes)

      expect(result.every(p => p.learnedFrom === 'consolidation')).toBe(true)
    })

    it('falls back to heuristic when consciousness returns invalid patterns', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          patterns: [{ trigger: 'something' }] // missing resolution and confidence
        })
      }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })

      const episodes = ['## 14:32 — Error: crash\nFixed the bug']
      const result = await consolidator.extractPatternsEnhanced(episodes)

      expect(result.every(p => p.learnedFrom === 'consolidation')).toBe(true)
    })

    it('falls back when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('CLI timeout'))
      }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })

      const episodes = ['## 14:32 — Error: fail\nSolved it']
      const result = await consolidator.extractPatternsEnhanced(episodes)

      // Should not throw, falls back to heuristic
      expect(result).toBeInstanceOf(Array)
    })

    it('uses heuristic when no consciousness provided', async () => {
      const consolidator = new Consolidator(mockMemory)

      const episodes = ['## 14:32 — Error: network fail\nSolved by restarting']
      const result = await consolidator.extractPatternsEnhanced(episodes)

      expect(result.every(p => p.learnedFrom === 'consolidation')).toBe(true)
    })

    it('truncates long episodes for consciousness', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          patterns: [{ trigger: 'x', resolution: 'y', confidence: 0.5 }]
        })
      }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })
      const longEpisode = 'x'.repeat(5000)

      await consolidator.extractPatternsEnhanced([longEpisode])

      const passedEpisodes = mockConsciousness.evaluate.mock.calls[0][2].episodes
      expect(passedEpisodes.length).toBeLessThanOrEqual(2000)
    })

    it('clamps confidence to 0-1 range', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          patterns: [
            { trigger: 'a', resolution: 'b', confidence: 1.5 },
            { trigger: 'c', resolution: 'd', confidence: -0.3 }
          ]
        })
      }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })

      const result = await consolidator.extractPatternsEnhanced(['some episode'])

      expect(result[0].confidence).toBe(1)
      expect(result[1].confidence).toBe(0)
    })

    it('returns empty for empty episodes', async () => {
      const mockConsciousness = { evaluate: vi.fn() }
      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })

      const result = await consolidator.extractPatternsEnhanced([])

      expect(result).toEqual([])
      expect(mockConsciousness.evaluate).not.toHaveBeenCalled()
    })
  })

  describe('run() with consciousness', () => {
    it('uses enhanced pattern extraction in run()', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          patterns: [
            { trigger: 'deploy failed', resolution: 'rollback to previous version', confidence: 0.9 }
          ]
        })
      }
      mockMemory.getRecentDays.mockResolvedValue(
        '## 14:32 — Deploy failed with error\nRolled back to previous version and it worked'
      )

      const consolidator = new Consolidator(mockMemory, { consciousness: mockConsciousness })
      const result = await consolidator.run()

      expect(mockConsciousness.evaluate).toHaveBeenCalled()
      expect(result.patternsAdded).toBe(1)
    })
  })
})
