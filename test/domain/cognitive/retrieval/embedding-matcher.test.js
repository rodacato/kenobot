import { describe, it, expect, beforeEach, vi } from 'vitest'
import EmbeddingMatcher from '../../../../src/domain/cognitive/retrieval/embedding-matcher.js'
import { FOOD_PREF, FOOD_QUERY, WEATHER_OBS, TECH_ERROR } from '../../../fixtures/embedding-vectors.js'

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('EmbeddingMatcher', () => {
  let matcher, mockProvider, mockStore

  beforeEach(() => {
    mockProvider = {
      embed: vi.fn()
    }
    mockStore = {
      search: vi.fn()
    }
    matcher = new EmbeddingMatcher({
      embeddingProvider: mockProvider,
      embeddingStore: mockStore,
      logger: mockLogger
    })
  })

  describe('search', () => {
    it('should embed query and search store', async () => {
      mockProvider.embed.mockResolvedValue([FOOD_QUERY])
      mockStore.search.mockResolvedValue([
        { id: 'f1', text: 'pizza is great', score: 0.95, metadata: { type: 'semantic' } }
      ])

      const results = await matcher.search('I like pizza', 'semantic', 5)

      expect(mockProvider.embed).toHaveBeenCalledWith(['I like pizza'], 'RETRIEVAL_QUERY')
      expect(mockStore.search).toHaveBeenCalledWith(FOOD_QUERY, 5, { type: 'semantic' })
      expect(results).toHaveLength(1)
      expect(results[0].text).toBe('pizza is great')
    })

    it('should pass filter options to store', async () => {
      mockProvider.embed.mockResolvedValue([FOOD_QUERY])
      mockStore.search.mockResolvedValue([])

      await matcher.search('query', 'episodic', 3, { sessionId: 'chat123' })

      expect(mockStore.search).toHaveBeenCalledWith(FOOD_QUERY, 3, {
        type: 'episodic',
        sessionId: 'chat123'
      })
    })

    it('should return empty array when provider returns null', async () => {
      mockProvider.embed.mockResolvedValue(null)

      const results = await matcher.search('broken query', 'semantic', 5)

      expect(results).toEqual([])
      expect(mockStore.search).not.toHaveBeenCalled()
    })
  })

  describe('mergeWithRRF', () => {
    it('should merge keyword-only results', () => {
      const keyword = [
        { content: 'pizza recipe', score: 3 },
        { content: 'pasta recipe', score: 1 }
      ]

      const merged = EmbeddingMatcher.mergeWithRRF(keyword, [])

      expect(merged).toHaveLength(2)
      expect(merged[0].content).toBe('pizza recipe')
      expect(merged[0].sources).toEqual(['keyword'])
      expect(merged[0].rrfScore).toBeGreaterThan(0)
    })

    it('should merge embedding-only results', () => {
      const embedding = [
        { text: 'pizza is delicious', score: 0.95 },
        { text: 'rain today', score: 0.3 }
      ]

      const merged = EmbeddingMatcher.mergeWithRRF([], embedding)

      expect(merged).toHaveLength(2)
      expect(merged[0].content).toBe('pizza is delicious')
      expect(merged[0].sources).toEqual(['embedding'])
    })

    it('should boost overlapping items from both sources', () => {
      const keyword = [
        { content: 'pizza recipe', score: 3 },
        { content: 'pasta recipe', score: 1 }
      ]
      const embedding = [
        { text: 'pizza recipe', score: 0.95 },
        { text: 'sushi recipe', score: 0.8 }
      ]

      const merged = EmbeddingMatcher.mergeWithRRF(keyword, embedding)

      // pizza recipe should be first (boosted by both)
      expect(merged[0].content).toBe('pizza recipe')
      expect(merged[0].sources).toContain('keyword')
      expect(merged[0].sources).toContain('embedding')
      // Its RRF score should be higher than single-source items
      expect(merged[0].rrfScore).toBeGreaterThan(merged[1].rrfScore)
    })

    it('should deduplicate by content', () => {
      const keyword = [{ content: 'same text', score: 3 }]
      const embedding = [{ text: 'same text', score: 0.9 }]

      const merged = EmbeddingMatcher.mergeWithRRF(keyword, embedding)

      expect(merged).toHaveLength(1)
      expect(merged[0].content).toBe('same text')
      expect(merged[0].sources).toEqual(['keyword', 'embedding'])
    })

    it('should return empty array for empty inputs', () => {
      const merged = EmbeddingMatcher.mergeWithRRF([], [])
      expect(merged).toEqual([])
    })

    it('should use custom k parameter', () => {
      const keyword = [{ content: 'a', score: 1 }]

      const default60 = EmbeddingMatcher.mergeWithRRF(keyword, [], 60)
      const small10 = EmbeddingMatcher.mergeWithRRF(keyword, [], 10)

      // Smaller k = higher score for top-ranked items
      expect(small10[0].rrfScore).toBeGreaterThan(default60[0].rrfScore)
    })
  })
})
