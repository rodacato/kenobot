import { describe, it, expect, beforeEach, vi } from 'vitest'
import RetrievalEngine from '../../../../src/domain/cognitive/retrieval/retrieval-engine.js'

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function mockMemorySystem({ longTermMemory = '', chatRecentDays = '' } = {}) {
  return {
    getLongTermMemory: vi.fn().mockResolvedValue(longTermMemory),
    getChatRecentDays: vi.fn().mockResolvedValue(chatRecentDays)
  }
}

describe('RetrievalEngine', () => {
  describe('keyword-only mode (no embeddingMatcher)', () => {
    it('should retrieve facts with keyword matching', async () => {
      const memory = mockMemorySystem({
        longTermMemory: '## Food\nUser likes pizza and pasta\n## Tech\nUser uses Node.js'
      })
      const engine = new RetrievalEngine(memory, { logger: mockLogger })

      const result = await engine.retrieve('chat1', 'tell me about pizza')

      expect(result.facts.length).toBeGreaterThan(0)
      expect(result.facts[0].content).toContain('pizza')
      expect(result.metadata.mode).toBe('keyword_only')
    })

    it('should retrieve episodes with keyword matching', async () => {
      const memory = mockMemorySystem({
        chatRecentDays: '## 10:00 — User asked about weather\n\n## 14:00 — Discussed pizza recipes'
      })
      const engine = new RetrievalEngine(memory, { logger: mockLogger })

      const result = await engine.retrieve('chat1', 'what about the pizza?')

      expect(result.episodes.length).toBeGreaterThan(0)
      expect(result.metadata.mode).toBe('keyword_only')
    })

    it('should return empty results for no matches', async () => {
      const memory = mockMemorySystem({ longTermMemory: '## Data\nSome unrelated content' })
      const engine = new RetrievalEngine(memory, { logger: mockLogger })

      const result = await engine.retrieve('chat1', 'xyz123nonexistent')

      expect(result.facts).toEqual([])
      expect(result.metadata.mode).toBe('keyword_only')
    })

    it('should return empty results on error', async () => {
      const memory = mockMemorySystem()
      memory.getLongTermMemory.mockRejectedValue(new Error('disk error'))
      const engine = new RetrievalEngine(memory, { logger: mockLogger })

      const result = await engine.retrieve('chat1', 'something')

      expect(result.facts).toEqual([])
      expect(result.confidence.level).toBe('none')
      expect(result.metadata.error).toBe('disk error')
    })
  })

  describe('hybrid mode (with embeddingMatcher)', () => {
    let mockEmbeddingMatcher

    beforeEach(() => {
      mockEmbeddingMatcher = {
        search: vi.fn().mockResolvedValue([])
      }
    })

    it('should set mode to hybrid when embeddingMatcher is present', async () => {
      const memory = mockMemorySystem()
      const engine = new RetrievalEngine(memory, {
        logger: mockLogger,
        embeddingMatcher: mockEmbeddingMatcher
      })

      const result = await engine.retrieve('chat1', 'hello')

      expect(result.metadata.mode).toBe('hybrid')
    })

    it('should call embeddingMatcher for facts', async () => {
      const memory = mockMemorySystem({
        longTermMemory: '## Food\nUser likes pizza'
      })
      mockEmbeddingMatcher.search.mockResolvedValue([
        { text: 'User enjoys Italian food', score: 0.9, metadata: {} }
      ])

      const engine = new RetrievalEngine(memory, {
        logger: mockLogger,
        embeddingMatcher: mockEmbeddingMatcher
      })

      const result = await engine.retrieve('chat1', 'what food does the user like?')

      expect(mockEmbeddingMatcher.search).toHaveBeenCalledWith(
        'what food does the user like?', 'semantic', 10
      )
      expect(result.facts.length).toBeGreaterThan(0)
    })

    it('should call embeddingMatcher for episodes with sessionId', async () => {
      const memory = mockMemorySystem({
        chatRecentDays: '## 10:00 — Discussed pizza\n'
      })
      mockEmbeddingMatcher.search.mockResolvedValue([
        { text: 'Episode about food', score: 0.85, metadata: {} }
      ])

      const engine = new RetrievalEngine(memory, {
        logger: mockLogger,
        embeddingMatcher: mockEmbeddingMatcher
      })

      await engine.retrieve('chat1', 'what did we talk about pizza?')

      // Should be called for both semantic and episodic
      const episodicCall = mockEmbeddingMatcher.search.mock.calls.find(
        call => call[1] === 'episodic'
      )
      expect(episodicCall).toBeDefined()
      expect(episodicCall[3]).toEqual({ sessionId: 'chat1' })
    })

    it('should fall back to keyword-only when embedding returns empty', async () => {
      const memory = mockMemorySystem({
        longTermMemory: '## Food\nUser likes pizza'
      })
      mockEmbeddingMatcher.search.mockResolvedValue([])

      const engine = new RetrievalEngine(memory, {
        logger: mockLogger,
        embeddingMatcher: mockEmbeddingMatcher
      })

      const result = await engine.retrieve('chat1', 'tell me about pizza')

      // Should still get keyword results
      expect(result.facts.length).toBeGreaterThan(0)
      expect(result.facts[0].content).toContain('pizza')
    })
  })
})
