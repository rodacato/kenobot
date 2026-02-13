import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import KeywordMatcher from '../../../src/cognitive/retrieval/keyword-matcher.js'

describe('KeywordMatcher', () => {
  let matcher

  beforeEach(() => {
    matcher = new KeywordMatcher()
    vi.clearAllMocks()
  })

  describe('search', () => {
    it('should return empty array when no items', () => {
      const result = matcher.search([], ['test'], 10)
      expect(result).toEqual([])
    })

    it('should return empty array when no keywords', () => {
      const items = ['test content']
      const result = matcher.search(items, [], 10)
      expect(result).toEqual([])
    })

    it('should find exact word matches', () => {
      const items = ['The webhook failed with error', 'Setup complete']
      const result = matcher.search(items, ['webhook'], 10)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('The webhook failed with error')
      expect(result[0].score).toBe(3) // Exact match = 3 points
      expect(result[0].matchedKeywords).toContain('webhook')
    })

    it('should find partial matches', () => {
      const items = ['debugging webhook issue', 'setup completed']
      const result = matcher.search(items, ['debug'], 10)

      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('debugging webhook issue')
      expect(result[0].score).toBe(1) // Partial match = 1 point
    })

    it('should score multiple keyword matches', () => {
      const items = [
        'webhook authentication failed',
        'webhook works fine',
        'setup database'
      ]
      const result = matcher.search(items, ['webhook', 'authentication'], 10)

      expect(result).toHaveLength(2)
      expect(result[0].score).toBe(6) // webhook (3) + authentication (3)
      expect(result[1].score).toBe(3) // webhook (3)
    })

    it('should sort results by score', () => {
      const items = [
        'low relevance item',
        'webhook authentication error handling',
        'webhook setup'
      ]
      const result = matcher.search(items, ['webhook', 'authentication'], 10)

      expect(result[0].score).toBeGreaterThan(result[1].score)
      expect(result[0].content).toContain('authentication')
    })

    it('should limit results', () => {
      const items = ['item1', 'item2', 'item3', 'item4', 'item5']
      const result = matcher.search(items, ['item'], 2)

      expect(result).toHaveLength(2)
    })

    it('should be case insensitive', () => {
      const items = ['WEBHOOK Failed', 'normal text']
      const result = matcher.search(items, ['webhook'], 10)

      expect(result).toHaveLength(1)
      expect(result[0].matchedKeywords).toContain('webhook')
    })

    it('should handle object items with content property', () => {
      const items = [
        { content: 'webhook test', metadata: { date: '2024-01-01' } },
        { content: 'other item', metadata: { date: '2024-01-02' } }
      ]
      const result = matcher.search(items, ['webhook'], 10)

      expect(result).toHaveLength(1)
      expect(result[0].metadata).toEqual({ date: '2024-01-01' })
    })
  })

  describe('extractKeywords', () => {
    it('should extract keywords from text', () => {
      const text = 'How to fix webhook authentication error'
      const keywords = matcher.extractKeywords(text)

      expect(keywords).toContain('fix')
      expect(keywords).toContain('webhook')
      expect(keywords).toContain('authentication')
      expect(keywords).toContain('error')
    })

    it('should remove stop words', () => {
      const text = 'The quick brown fox jumps over the lazy dog'
      const keywords = matcher.extractKeywords(text)

      expect(keywords).not.toContain('the')
      expect(keywords).not.toContain('over')
      expect(keywords).toContain('quick')
      expect(keywords).toContain('brown')
    })

    it('should remove short words', () => {
      const text = 'I am a developer'
      const keywords = matcher.extractKeywords(text)

      expect(keywords).not.toContain('i')
      expect(keywords).not.toContain('am')
      expect(keywords).toContain('developer')
    })

    it('should remove duplicates', () => {
      const text = 'webhook webhook test webhook'
      const keywords = matcher.extractKeywords(text)

      expect(keywords.filter(k => k === 'webhook')).toHaveLength(1)
    })

    it('should handle Spanish stop words', () => {
      const text = 'Cómo arreglar el webhook de n8n'
      const keywords = matcher.extractKeywords(text)

      expect(keywords).not.toContain('el')
      expect(keywords).not.toContain('de')
      expect(keywords).toContain('arreglar')
      expect(keywords).toContain('webhook')
      expect(keywords).toContain('n8n')
    })
  })
})
