import MemoryPruner from '../../../../src/domain/cognitive/consolidation/memory-pruner.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('MemoryPruner — consciousness integration', () => {
  let mockMemory

  beforeEach(() => {
    vi.clearAllMocks()
    mockMemory = {
      getPatterns: vi.fn().mockResolvedValue([]),
      listDailyLogs: vi.fn().mockResolvedValue([]),
      getLongTermMemory: vi.fn().mockResolvedValue(''),
      writeLongTermMemory: vi.fn().mockResolvedValue(undefined),
      store: {
        listWorkingMemorySessions: vi.fn().mockResolvedValue([]),
        deleteWorkingMemory: vi.fn().mockResolvedValue(undefined),
        deleteDailyLog: vi.fn().mockResolvedValue(undefined)
      },
      procedural: { remove: vi.fn().mockResolvedValue(undefined) }
    }
  })

  describe('compactLongTermMemoryEnhanced', () => {
    it('uses consciousness to verify duplicates and merge', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          duplicate: true,
          merged: 'User prefers using dark mode theme everywhere'
        })
      }
      // Facts must have >0.7 Jaccard similarity to be detected as candidates
      mockMemory.getLongTermMemory.mockResolvedValue(
        '# Memory\n- User prefers using dark mode theme always\n- User prefers using dark mode theme often'
      )

      const pruner = new MemoryPruner(mockMemory, { consciousness: mockConsciousness })
      const removed = await pruner.compactLongTermMemoryEnhanced()

      expect(removed).toBe(1)
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'semantic-analyst',
        'deduplicate_facts',
        expect.objectContaining({
          factA: 'User prefers using dark mode theme always',
          factB: 'User prefers using dark mode theme often'
        })
      )
      // Should write merged version
      const written = mockMemory.writeLongTermMemory.mock.calls[0][0]
      expect(written).toContain('User prefers using dark mode theme everywhere')
      expect(written).not.toContain('User prefers using dark mode theme often')
    })

    it('keeps both facts when consciousness says not duplicate', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          duplicate: false,
          merged: ''
        })
      }
      // Need facts with high Jaccard similarity to trigger candidate detection
      mockMemory.getLongTermMemory.mockResolvedValue(
        '# Memory\n- user prefers dark mode theme\n- user prefers dark mode editor'
      )

      const pruner = new MemoryPruner(mockMemory, { consciousness: mockConsciousness })
      const removed = await pruner.compactLongTermMemoryEnhanced()

      expect(removed).toBe(0)
    })

    it('falls back to Jaccard when no consciousness provided', async () => {
      // Two facts with >70% Jaccard similarity
      mockMemory.getLongTermMemory.mockResolvedValue(
        '# Memory\n- user prefers dark mode\n- user prefers dark mode'
      )

      const pruner = new MemoryPruner(mockMemory)
      const removed = await pruner.compactLongTermMemoryEnhanced()

      // Falls back to compactLongTermMemory which uses Jaccard
      expect(removed).toBe(1)
    })

    it('falls back to Jaccard removal when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('CLI timeout'))
      }
      // Two identical facts (high Jaccard)
      mockMemory.getLongTermMemory.mockResolvedValue(
        '# Memory\n- user prefers dark mode\n- user prefers dark mode'
      )

      const pruner = new MemoryPruner(mockMemory, { consciousness: mockConsciousness })
      const removed = await pruner.compactLongTermMemoryEnhanced()

      // Should still remove the duplicate via catch fallback
      expect(removed).toBe(1)
    })

    it('returns 0 when no facts exist', async () => {
      const mockConsciousness = { evaluate: vi.fn() }
      mockMemory.getLongTermMemory.mockResolvedValue('# Memory\n## Section\nSome text')

      const pruner = new MemoryPruner(mockMemory, { consciousness: mockConsciousness })
      const removed = await pruner.compactLongTermMemoryEnhanced()

      expect(removed).toBe(0)
      expect(mockConsciousness.evaluate).not.toHaveBeenCalled()
    })

    it('returns 0 when only one fact exists', async () => {
      const mockConsciousness = { evaluate: vi.fn() }
      mockMemory.getLongTermMemory.mockResolvedValue('# Memory\n- single fact')

      const pruner = new MemoryPruner(mockMemory, { consciousness: mockConsciousness })
      const removed = await pruner.compactLongTermMemoryEnhanced()

      expect(removed).toBe(0)
    })

    it('handles duplicate without merged text (keeps first)', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          duplicate: true,
          merged: ''
        })
      }
      mockMemory.getLongTermMemory.mockResolvedValue(
        '# Memory\n- user prefers dark mode\n- user prefers dark mode'
      )

      const pruner = new MemoryPruner(mockMemory, { consciousness: mockConsciousness })
      const removed = await pruner.compactLongTermMemoryEnhanced()

      expect(removed).toBe(1)
      const written = mockMemory.writeLongTermMemory.mock.calls[0][0]
      expect(written).toContain('- user prefers dark mode')
    })
  })

  describe('run() with consciousness', () => {
    it('uses enhanced deduplication in run()', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          duplicate: true,
          merged: 'User prefers dark themes'
        })
      }
      mockMemory.getLongTermMemory.mockResolvedValue(
        '# Memory\n- user prefers dark mode\n- user prefers dark mode always'
      )

      const pruner = new MemoryPruner(mockMemory, { consciousness: mockConsciousness })
      const result = await pruner.run()

      expect(result.factsDeduped).toBe(1)
    })
  })
})
