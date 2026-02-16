import KeywordMatcher from '../../../../src/domain/cognitive/retrieval/keyword-matcher.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('KeywordMatcher — consciousness integration', () => {
  describe('extractKeywordsEnhanced', () => {
    it('uses consciousness expansion when available', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          expanded: ['webhook', 'hook', 'callback', 'endpoint', 'api']
        })
      }
      const matcher = new KeywordMatcher({ consciousness: mockConsciousness })

      const result = await matcher.extractKeywordsEnhanced('configurar mi webhook')

      expect(result).toEqual(['webhook', 'hook', 'callback', 'endpoint', 'api'])
      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'semantic-analyst',
        'expand_keywords',
        expect.objectContaining({ keywords: expect.stringContaining('webhook') })
      )
    })

    it('falls back to heuristic when consciousness returns null', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue(null)
      }
      const matcher = new KeywordMatcher({ consciousness: mockConsciousness })

      const result = await matcher.extractKeywordsEnhanced('configurar mi webhook')

      expect(result).toContain('configurar')
      expect(result).toContain('webhook')
    })

    it('falls back to heuristic when consciousness throws', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockRejectedValue(new Error('CLI timeout'))
      }
      const matcher = new KeywordMatcher({ consciousness: mockConsciousness })

      // Should not throw, just return heuristic
      const result = await matcher.extractKeywordsEnhanced('configurar mi webhook')

      expect(result).toContain('webhook')
    })

    it('uses heuristic when no consciousness provided', async () => {
      const matcher = new KeywordMatcher()

      const result = await matcher.extractKeywordsEnhanced('configurar mi webhook')

      expect(result).toContain('configurar')
      expect(result).toContain('webhook')
    })

    it('passes chatContext to consciousness', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          expanded: ['webhook', 'api']
        })
      }
      const matcher = new KeywordMatcher({ consciousness: mockConsciousness })

      await matcher.extractKeywordsEnhanced('webhook error', {
        chatContext: 'Type: Work group\nTone: Technical'
      })

      expect(mockConsciousness.evaluate).toHaveBeenCalledWith(
        'semantic-analyst',
        'expand_keywords',
        expect.objectContaining({
          chatContext: 'Type: Work group\nTone: Technical'
        })
      )
    })

    it('returns heuristic for empty text', async () => {
      const mockConsciousness = { evaluate: vi.fn() }
      const matcher = new KeywordMatcher({ consciousness: mockConsciousness })

      const result = await matcher.extractKeywordsEnhanced('')

      expect(result).toEqual([])
      expect(mockConsciousness.evaluate).not.toHaveBeenCalled()
    })

    it('returns heuristic when consciousness returns invalid expanded format', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({ expanded: 'not-an-array' })
      }
      const matcher = new KeywordMatcher({ consciousness: mockConsciousness })

      const result = await matcher.extractKeywordsEnhanced('webhook error')

      expect(result).toContain('webhook')
      expect(result).toContain('error')
    })

    it('A/B: consciousness provides better expansion for Spanish queries', async () => {
      const mockConsciousness = {
        evaluate: vi.fn().mockResolvedValue({
          expanded: ['webhook', 'funciona', 'error', 'fallo', 'authentication', 'connection']
        })
      }
      const matcher = new KeywordMatcher({ consciousness: mockConsciousness })
      const matcherHeuristic = new KeywordMatcher()

      const heuristic = matcherHeuristic.extractKeywords('mi webhook no funciona')
      const enhanced = await matcher.extractKeywordsEnhanced('mi webhook no funciona')

      // Heuristic only gets words from the text
      expect(heuristic).not.toContain('error')
      expect(heuristic).not.toContain('authentication')

      // Consciousness adds semantic expansions
      expect(enhanced).toContain('error')
      expect(enhanced).toContain('authentication')
      expect(enhanced.length).toBeGreaterThan(heuristic.length)
    })
  })
})
