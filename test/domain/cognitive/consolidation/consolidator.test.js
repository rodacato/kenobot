import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import Consolidator from '../../../../src/domain/cognitive/consolidation/consolidator.js'

describe('Consolidator', () => {
  let consolidator
  let mockMemory

  beforeEach(() => {
    mockMemory = {
      getRecentDays: vi.fn().mockResolvedValue(''),
      getChatRecentDays: vi.fn().mockResolvedValue(''),
      getLongTermMemory: vi.fn().mockResolvedValue(''),
      writeLongTermMemory: vi.fn().mockResolvedValue(undefined),
      addFact: vi.fn().mockResolvedValue(undefined),
      getPatterns: vi.fn().mockResolvedValue([]),
      store: {
        listChatSessions: vi.fn().mockResolvedValue([])
      },
      procedural: {
        add: vi.fn().mockResolvedValue(undefined)
      }
    }
    consolidator = new Consolidator(mockMemory)
    vi.clearAllMocks()
  })

  describe('run', () => {
    it('should return consolidation results', async () => {
      const result = await consolidator.run()

      expect(result).toHaveProperty('episodesProcessed')
      expect(result).toHaveProperty('patternsAdded')
      expect(result).toHaveProperty('factsAdded')
    })

    it('should return zeros when no episodes exist', async () => {
      mockMemory.getRecentDays.mockResolvedValue('')

      const result = await consolidator.run()

      expect(result.episodesProcessed).toBe(0)
      expect(result.factsAdded).toBe(0)
      expect(result.patternsAdded).toBe(0)
    })

    it('should process episodes from global and chat sources', async () => {
      mockMemory.getRecentDays.mockResolvedValue(
        '## 10:00 — User always prefers Spanish for conversation'
      )
      mockMemory.store.listChatSessions.mockResolvedValue(['chat-1'])
      mockMemory.getChatRecentDays.mockResolvedValue(
        '## 11:00 — An error occurred and was solved with a restart'
      )

      const result = await consolidator.run()

      expect(result.episodesProcessed).toBe(2)
    })

    it('should extract facts from episodes', async () => {
      mockMemory.getRecentDays.mockResolvedValue(
        '## 10:00 — Adrian prefiere modo oscuro siempre'
      )

      const result = await consolidator.run()

      expect(result.factsAdded).toBeGreaterThan(0)
      expect(mockMemory.writeLongTermMemory).toHaveBeenCalled()
    })

    it('should extract patterns from error+resolution episodes', async () => {
      mockMemory.getRecentDays.mockResolvedValue(
        '## 10:00 — n8n webhook error returned 401\nThe error was solved by adding ?token= query param'
      )

      const result = await consolidator.run()

      expect(result.patternsAdded).toBeGreaterThan(0)
      expect(mockMemory.procedural.add).toHaveBeenCalled()
    })
  })

  describe('scoreSalience', () => {
    it('should return 1.0 for all episodes (trusts LLM curation)', () => {
      expect(consolidator.scoreSalience('An error occurred')).toBe(1.0)
      expect(consolidator.scoreSalience('Regular weather chat')).toBe(1.0)
      expect(consolidator.scoreSalience('Usuario prefiere español')).toBe(1.0)
    })
  })

  describe('extractFacts', () => {
    it('should extract all episode content regardless of language', () => {
      const episodes = [
        'Usuario prefiere comunicarse en español',
        'User prefers to communicate in English'
      ]

      const facts = consolidator.extractFacts(episodes)

      expect(facts).toHaveLength(2)
      expect(facts[0]).toContain('prefiere')
      expect(facts[1]).toContain('prefers')
    })

    it('should extract multiple facts from multiple episodes', () => {
      const episodes = [
        'Stack principal: Node.js + PostgreSQL',
        'Migrando de Express a Fastify'
      ]

      const facts = consolidator.extractFacts(episodes)

      expect(facts).toHaveLength(2)
    })

    it('should skip headers', () => {
      const episodes = ['# Some Header\nUser prefers dark mode']

      const facts = consolidator.extractFacts(episodes)

      expect(facts).toHaveLength(1)
      expect(facts[0]).not.toContain('#')
    })

    it('should skip short content (<=10 chars)', () => {
      const episodes = ['Short']

      const facts = consolidator.extractFacts(episodes)

      expect(facts).toEqual([])
    })

    it('should strip timestamp prefix from facts', () => {
      const episodes = ['## 10:00 — Adrian prefiere respuestas con código']

      const facts = consolidator.extractFacts(episodes)

      expect(facts[0]).not.toMatch(/^## \d{2}:\d{2}/)
      expect(facts[0]).toContain('Adrian prefiere')
    })
  })

  describe('extractPatterns', () => {
    it('should extract pattern from error+resolution episode', () => {
      const episodes = [
        'n8n webhook error returned 401 unauthorized\nThe issue was solved by adding the token param'
      ]

      const patterns = consolidator.extractPatterns(episodes)

      expect(patterns).toHaveLength(1)
      expect(patterns[0]).toMatchObject({
        confidence: 0.6,
        learnedFrom: 'consolidation'
      })
      expect(patterns[0].trigger).toBeTruthy()
      expect(patterns[0].response).toBeTruthy()
    })

    it('should not extract pattern when only error (no resolution)', () => {
      const episodes = ['An error occurred but nothing was done about it']

      const patterns = consolidator.extractPatterns(episodes)

      expect(patterns).toEqual([])
    })

    it('should not extract pattern from mundane episodes', () => {
      const episodes = ['Regular conversation about the weather today']

      const patterns = consolidator.extractPatterns(episodes)

      expect(patterns).toEqual([])
    })
  })

  describe('extractPattern (legacy)', () => {
    it('should return null when no patterns found', () => {
      const pattern = consolidator.extractPattern(['episode 1', 'episode 2'])

      expect(pattern).toBeNull()
    })

    it('should return first pattern when found', () => {
      const pattern = consolidator.extractPattern([
        'An error in the API was fixed by restarting the service'
      ])

      expect(pattern).not.toBeNull()
      expect(pattern.trigger).toBeTruthy()
    })
  })

  describe('_parseEntries', () => {
    it('should split text by timestamp headers', () => {
      const text = '## 10:00 — First entry\n\n## 11:00 — Second entry'

      const entries = consolidator._parseEntries(text)

      expect(entries).toHaveLength(2)
    })

    it('should handle empty text', () => {
      expect(consolidator._parseEntries('')).toEqual([])
      expect(consolidator._parseEntries(null)).toEqual([])
    })

    it('should handle text without timestamp headers', () => {
      const entries = consolidator._parseEntries('Just plain text without headers')

      expect(entries).toHaveLength(1)
    })
  })
})
