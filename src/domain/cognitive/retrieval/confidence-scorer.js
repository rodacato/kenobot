import defaultLogger from '../../../infrastructure/logger.js'

/**
 * ConfidenceScorer - Scores retrieval confidence based on results quality
 *
 * Confidence levels:
 * - none: No results found
 * - low: Results exist but scores are low (<2 avg)
 * - medium: Moderate scores (2-4 avg)
 * - high: Strong scores (>4 avg)
 *
 * Used to help the LLM understand how confident it should be in retrieved context.
 */
export default class ConfidenceScorer {
  constructor({ logger = defaultLogger, consciousness } = {}) {
    this.logger = logger
    this.consciousness = consciousness || null
  }

  /**
   * Score overall confidence of retrieval results.
   *
   * @param {Object} results - Retrieval results from RetrievalEngine
   * @param {Array} results.facts - Retrieved facts with scores
   * @param {Array} results.procedures - Retrieved procedures with scores
   * @param {Array} results.episodes - Retrieved episodes with scores
   * @returns {{level: string, score: number, breakdown: Object, metadata: Object}}
   */
  score(results) {
    const { facts = [], procedures = [], episodes = [] } = results

    // Count total results
    const totalResults = facts.length + procedures.length + episodes.length

    if (totalResults === 0) {
      return {
        level: 'none',
        score: 0,
        breakdown: { facts: 0, procedures: 0, episodes: 0 },
        metadata: { reason: 'No results found' }
      }
    }

    // Calculate average score for each type
    const factScore = this._averageScore(facts)
    const procedureScore = this._averageScore(procedures)
    const episodeScore = this._averageScore(episodes)

    // Weighted average (facts and procedures more important than episodes)
    const weights = {
      facts: facts.length > 0 ? 0.4 : 0,
      procedures: procedures.length > 0 ? 0.4 : 0,
      episodes: episodes.length > 0 ? 0.2 : 0
    }

    // Normalize weights
    const totalWeight = weights.facts + weights.procedures + weights.episodes
    if (totalWeight > 0) {
      weights.facts /= totalWeight
      weights.procedures /= totalWeight
      weights.episodes /= totalWeight
    }

    const overallScore =
      factScore * weights.facts +
      procedureScore * weights.procedures +
      episodeScore * weights.episodes

    // Determine confidence level
    let level
    if (overallScore === 0) {
      level = 'none'
    } else if (overallScore < 2) {
      level = 'low'
    } else if (overallScore < 4) {
      level = 'medium'
    } else {
      level = 'high'
    }

    const result = {
      level,
      score: Math.round(overallScore * 100) / 100, // Round to 2 decimals
      breakdown: {
        facts: Math.round(factScore * 100) / 100,
        procedures: Math.round(procedureScore * 100) / 100,
        episodes: Math.round(episodeScore * 100) / 100
      },
      metadata: {
        totalResults,
        counts: {
          facts: facts.length,
          procedures: procedures.length,
          episodes: episodes.length
        },
        topScores: {
          fact: facts[0]?.score || 0,
          procedure: procedures[0]?.score || 0,
          episode: episodes[0]?.score || 0
        }
      }
    }

    this.logger.info('confidence-scorer', 'scored', {
      level: result.level,
      score: result.score,
      totalResults
    })

    return result
  }

  /**
   * Calculate average score from results array.
   * @private
   * @param {Array<{score: number}>} results
   * @returns {number}
   */
  _averageScore(results) {
    if (!results || results.length === 0) return 0

    const sum = results.reduce((acc, item) => acc + (item.score || 0), 0)
    return sum / results.length
  }

  /**
   * Get human-readable confidence description.
   *
   * @param {string} level - Confidence level (none, low, medium, high)
   * @returns {string} Description
   */
  getDescription(level) {
    const descriptions = {
      none: 'No relevant context found',
      low: 'Limited context available, answer may be uncertain',
      medium: 'Moderate context available, answer should be reasonable',
      high: 'Strong context available, answer should be confident'
    }

    return descriptions[level] || descriptions.none
  }

  /**
   * Score confidence with consciousness-enhanced relevance evaluation.
   * Falls back to heuristic score() on any failure.
   *
   * @param {Object} results - Retrieval results
   * @param {string} query - The user's original query
   * @returns {Promise<{level: string, score: number, breakdown: Object, metadata: Object}>}
   */
  async scoreEnhanced(results, query) {
    const heuristicResult = this.score(results)

    if (!this.consciousness) return heuristicResult
    if (heuristicResult.level === 'none') return heuristicResult

    const validLevels = ['none', 'low', 'medium', 'high']

    try {
      const topResults = [
        ...results.facts?.slice(0, 3).map(f => f.content || '') || [],
        ...results.episodes?.slice(0, 2).map(e => e.content || '') || []
      ].filter(r => r.length > 0).join('\n---\n').slice(0, 1500)

      if (!topResults) return heuristicResult

      const result = await this.consciousness.evaluate('semantic-analyst', 'evaluate_confidence', {
        query: (query || '').slice(0, 500),
        results: topResults
      })

      if (result?.level && validLevels.includes(result.level) &&
          typeof result.score === 'number') {
        this.logger.debug('confidence-scorer', 'consciousness_scored', {
          level: result.level,
          score: result.score,
          reason: result.reason
        })
        return {
          ...heuristicResult,
          level: result.level,
          score: Math.max(0, Math.min(1, Math.round(result.score * 100) / 100)),
          metadata: {
            ...heuristicResult.metadata,
            consciousnessReason: result.reason || ''
          }
        }
      }
    } catch (error) {
      this.logger.warn('confidence-scorer', 'consciousness_failed', { error: error.message })
    }

    return {
      ...heuristicResult,
      metadata: { ...heuristicResult.metadata, consciousnessAttempted: true }
    }
  }
}
