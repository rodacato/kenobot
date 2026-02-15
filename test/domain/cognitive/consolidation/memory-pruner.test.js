import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import MemoryPruner from '../../../../src/domain/cognitive/consolidation/memory-pruner.js'

describe('MemoryPruner', () => {
  let pruner
  let mockMemory

  beforeEach(() => {
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
      procedural: {
        remove: vi.fn().mockResolvedValue(true)
      }
    }
    pruner = new MemoryPruner(mockMemory)
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with default thresholds', () => {
      expect(pruner.staleThreshold).toBe(7)
      expect(pruner.archiveThreshold).toBe(30)
    })

    it('should accept custom thresholds', () => {
      const customPruner = new MemoryPruner(mockMemory, {
        staleThreshold: 14,
        archiveThreshold: 60
      })

      expect(customPruner.staleThreshold).toBe(14)
      expect(customPruner.archiveThreshold).toBe(60)
    })
  })

  describe('run', () => {
    it('should return pruning results', async () => {
      const result = await pruner.run()

      expect(result).toHaveProperty('workingPruned')
      expect(result).toHaveProperty('episodesCompressed')
      expect(result).toHaveProperty('patternsPruned')
      expect(result).toHaveProperty('factsDeduped')
    })

    it('should delegate to sub-methods', async () => {
      // Setup stale working memory
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
      mockMemory.store.listWorkingMemorySessions.mockResolvedValue([
        { sessionId: 'old-session', updatedAt: tenDaysAgo }
      ])

      // Setup low-confidence pattern
      mockMemory.getPatterns.mockResolvedValue([
        { id: 'p1', confidence: 0.1, usageCount: 0 }
      ])

      const result = await pruner.run()

      expect(result.workingPruned).toBe(1)
      expect(result.patternsPruned).toBe(1)
    })
  })

  describe('pruneWorkingMemory', () => {
    it('should return 0 when no stale sessions', async () => {
      mockMemory.store.listWorkingMemorySessions.mockResolvedValue([
        { sessionId: 'recent', updatedAt: Date.now() }
      ])

      const count = await pruner.pruneWorkingMemory()

      expect(count).toBe(0)
    })

    it('should delete stale sessions', async () => {
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
      mockMemory.store.listWorkingMemorySessions.mockResolvedValue([
        { sessionId: 'stale-1', updatedAt: tenDaysAgo },
        { sessionId: 'recent', updatedAt: Date.now() }
      ])

      const count = await pruner.pruneWorkingMemory()

      expect(count).toBe(1)
      expect(mockMemory.store.deleteWorkingMemory).toHaveBeenCalledWith('stale-1')
    })

    it('should return 0 when store has no listWorkingMemorySessions', async () => {
      const basicPruner = new MemoryPruner({ store: {}, getPatterns: vi.fn().mockResolvedValue([]) })

      const count = await basicPruner.pruneWorkingMemory()

      expect(count).toBe(0)
    })

    it('should handle delete errors gracefully', async () => {
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
      mockMemory.store.listWorkingMemorySessions.mockResolvedValue([
        { sessionId: 'stale-1', updatedAt: tenDaysAgo }
      ])
      mockMemory.store.deleteWorkingMemory.mockRejectedValue(new Error('Permission denied'))

      const count = await pruner.pruneWorkingMemory()

      expect(count).toBe(0)
    })
  })

  describe('compressEpisodes', () => {
    it('should return 0 when no old daily logs', async () => {
      mockMemory.listDailyLogs.mockResolvedValue(['2026-02-14.md'])

      const count = await pruner.compressEpisodes()

      expect(count).toBe(0)
    })

    it('should delete daily logs older than archiveThreshold', async () => {
      mockMemory.listDailyLogs.mockResolvedValue([
        '2025-12-01.md', // >30 days old
        '2025-12-15.md', // >30 days old
        '2026-02-14.md'  // recent
      ])

      const count = await pruner.compressEpisodes()

      expect(count).toBe(2)
      expect(mockMemory.store.deleteDailyLog).toHaveBeenCalledWith('2025-12-01.md')
      expect(mockMemory.store.deleteDailyLog).toHaveBeenCalledWith('2025-12-15.md')
      expect(mockMemory.store.deleteDailyLog).not.toHaveBeenCalledWith('2026-02-14.md')
    })

    it('should handle delete errors gracefully', async () => {
      mockMemory.listDailyLogs.mockResolvedValue(['2025-01-01.md'])
      mockMemory.store.deleteDailyLog.mockRejectedValue(new Error('Permission denied'))

      const count = await pruner.compressEpisodes()

      expect(count).toBe(0)
    })

    it('should return 0 when store has no deleteDailyLog', async () => {
      const basicPruner = new MemoryPruner({
        store: {},
        getPatterns: vi.fn().mockResolvedValue([]),
        listDailyLogs: vi.fn().mockResolvedValue([]),
        getLongTermMemory: vi.fn().mockResolvedValue(''),
        writeLongTermMemory: vi.fn()
      })

      const count = await basicPruner.compressEpisodes()

      expect(count).toBe(0)
    })
  })

  describe('compactLongTermMemory', () => {
    it('should return 0 when MEMORY.md is empty', async () => {
      mockMemory.getLongTermMemory.mockResolvedValue('')

      const count = await pruner.compactLongTermMemory()

      expect(count).toBe(0)
    })

    it('should return 0 when fewer than 2 facts', async () => {
      mockMemory.getLongTermMemory.mockResolvedValue('# Memory\n- single fact\n')

      const count = await pruner.compactLongTermMemory()

      expect(count).toBe(0)
    })

    it('should remove near-duplicate facts', async () => {
      mockMemory.getLongTermMemory.mockResolvedValue([
        '# Long-Term Memory',
        '',
        '## Consolidated — 2026-02-14',
        '- Adrian favorite programming languages JavaScript and Ruby',
        '',
        '## Consolidated — 2026-02-15',
        '- Adrian favorite programming languages are JavaScript and Ruby',
        '- User timezone is UTC-6'
      ].join('\n'))

      const count = await pruner.compactLongTermMemory()

      expect(count).toBe(1)
      expect(mockMemory.writeLongTermMemory).toHaveBeenCalled()
      const written = mockMemory.writeLongTermMemory.mock.calls[0][0]
      expect(written).toContain('Adrian favorite programming languages JavaScript and Ruby')
      expect(written).toContain('User timezone is UTC-6')
    })

    it('should not remove dissimilar facts', async () => {
      mockMemory.getLongTermMemory.mockResolvedValue([
        '# Memory',
        '- Adrian likes JavaScript',
        '- User prefers dark mode for editing',
        '- Deployment runs on Hetzner VPS'
      ].join('\n'))

      const count = await pruner.compactLongTermMemory()

      expect(count).toBe(0)
    })

    it('should be idempotent — running twice gives same result', async () => {
      const content = [
        '# Memory',
        '- Adrian favorite languages JavaScript Ruby',
        '- Adrian favorite languages are JavaScript and Ruby',
        '- User lives in Costa Rica'
      ].join('\n')
      mockMemory.getLongTermMemory.mockResolvedValue(content)

      await pruner.compactLongTermMemory()
      const firstWrite = mockMemory.writeLongTermMemory.mock.calls[0][0]

      // Simulate second run with the result from first
      mockMemory.getLongTermMemory.mockResolvedValue(firstWrite)
      mockMemory.writeLongTermMemory.mockClear()

      const count2 = await pruner.compactLongTermMemory()

      expect(count2).toBe(0) // no more duplicates
    })
  })

  describe('prunePatterns', () => {
    it('should return 0 when no patterns', async () => {
      const count = await pruner.prunePatterns()

      expect(count).toBe(0)
    })

    it('should remove low-confidence unused patterns', async () => {
      mockMemory.getPatterns.mockResolvedValue([
        { id: 'p1', confidence: 0.1, usageCount: 0 },
        { id: 'p2', confidence: 0.8, usageCount: 3 }
      ])

      const count = await pruner.prunePatterns()

      expect(count).toBe(1)
      expect(mockMemory.procedural.remove).toHaveBeenCalledWith('p1')
    })

    it('should keep low-confidence patterns that have been used', async () => {
      mockMemory.getPatterns.mockResolvedValue([
        { id: 'p1', confidence: 0.2, usageCount: 5 }
      ])

      const count = await pruner.prunePatterns()

      expect(count).toBe(0)
    })

    it('should keep high-confidence unused patterns', async () => {
      mockMemory.getPatterns.mockResolvedValue([
        { id: 'p1', confidence: 0.9, usageCount: 0 }
      ])

      const count = await pruner.prunePatterns()

      expect(count).toBe(0)
    })
  })

  describe('findSimilarEpisodes', () => {
    it('should return empty array for empty input', () => {
      expect(pruner.findSimilarEpisodes([])).toEqual([])
    })

    it('should return empty array for single episode', () => {
      expect(pruner.findSimilarEpisodes(['one episode'])).toEqual([])
    })

    it('should group similar episodes together', () => {
      const episodes = [
        'The user asked about the weather in New York today',
        'The user asked about the weather in New York tomorrow',
        'A completely different topic about programming in Python'
      ]

      const groups = pruner.findSimilarEpisodes(episodes)

      expect(groups.length).toBeGreaterThan(0)
      expect(groups[0]).toContain(0)
      expect(groups[0]).toContain(1)
    })

    it('should not group dissimilar episodes', () => {
      const episodes = [
        'Discussing quantum physics and particle interactions',
        'Cooking recipes for Italian pasta dishes',
        'JavaScript programming and web development'
      ]

      const groups = pruner.findSimilarEpisodes(episodes)

      expect(groups).toEqual([])
    })
  })

  describe('mergeEpisodes', () => {
    it('should concatenate episodes with newlines', () => {
      const merged = pruner.mergeEpisodes(['Episode 1', 'Episode 2', 'Episode 3'])

      expect(merged).toBe('Episode 1\n\nEpisode 2\n\nEpisode 3')
    })

    it('should handle single episode', () => {
      const merged = pruner.mergeEpisodes(['Single episode'])

      expect(merged).toBe('Single episode')
    })

    it('should handle empty array', () => {
      const merged = pruner.mergeEpisodes([])

      expect(merged).toBe('')
    })
  })
})
