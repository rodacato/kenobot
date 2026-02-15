import defaultLogger from '../../../infrastructure/logger.js'

/**
 * KeywordMatcher - Simple keyword-based search for memory retrieval
 *
 * Phase 2: Uses string matching and scoring
 * Phase 4+: Could be enhanced with embeddings if needed
 *
 * Scoring algorithm:
 * - Exact match: +3 points
 * - Partial match (contains): +1 point
 * - Case-insensitive matching
 */
export default class KeywordMatcher {
  constructor({ logger = defaultLogger } = {}) {
    this.logger = logger
  }

  /**
   * Search items by keywords and return top N results with scores.
   *
   * @param {Array<{content: string, metadata?: Object}>} items - Items to search
   * @param {string[]} keywords - Keywords to search for
   * @param {number} limit - Maximum results to return
   * @returns {Array<{content: string, score: number, matchedKeywords: string[], metadata?: Object}>}
   */
  search(items, keywords, limit = 10) {
    if (!items || items.length === 0) return []
    if (!keywords || keywords.length === 0) return []

    const normalizedKeywords = keywords.map(k => k.toLowerCase().trim())

    // Score each item
    const scored = items.map(item => {
      const content = typeof item === 'string' ? item : item.content
      const contentLower = content.toLowerCase()

      let score = 0
      const matched = []

      for (const keyword of normalizedKeywords) {
        // Exact word match (with word boundaries)
        const exactRegex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi')
        if (exactRegex.test(content)) {
          score += 3
          matched.push(keyword)
        }
        // Partial match (contains)
        else if (contentLower.includes(keyword)) {
          score += 1
          matched.push(keyword)
        }
      }

      return {
        content,
        score,
        matchedKeywords: matched,
        metadata: typeof item === 'object' ? item.metadata : undefined
      }
    })

    // Filter to only items with matches, sort by score, and limit
    const results = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    this.logger.info('keyword-matcher', 'search_complete', {
      totalItems: items.length,
      keywords: normalizedKeywords,
      matchedCount: results.length,
      topScore: results[0]?.score || 0
    })

    return results
  }

  /**
   * Extract simple keywords from text (for basic query expansion).
   * Removes common stop words and short words.
   *
   * @param {string} text - Text to extract keywords from
   * @returns {string[]} Array of keywords
   */
  extractKeywords(text) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'can', 'over', 'under',
      'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o',
      'que', 'por', 'para', 'con', 'es', 'está', 'son', 'como', 'cómo'
    ])

    const words = text
      .toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ') // Keep letters, numbers, spaces, spanish chars
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))

    // Remove duplicates
    return [...new Set(words)]
  }

  /**
   * Escape special regex characters in a string.
   * @private
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
