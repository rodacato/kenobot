import defaultLogger from '../../../infrastructure/logger.js'

/**
 * ConfidenceEstimator - Estimates confidence in retrieval results
 *
 * Integrates with RetrievalEngine confidence scores to provide
 * an overall confidence assessment for a given interaction.
 */
export default class ConfidenceEstimator {
  constructor({ logger = defaultLogger, consciousness } = {}) {
    this.logger = logger
    this.consciousness = consciousness || null
  }

  /**
   * Estimate confidence based on retrieval results and context.
   *
   * @param {Object} retrievalResult - Result from RetrievalEngine
   * @param {Object} [retrievalResult.confidence] - Confidence metadata from retrieval
   * @param {string} [retrievalResult.confidence.level] - 'high'|'medium'|'low'
   * @param {number} [retrievalResult.confidence.score] - 0.0-1.0
   * @param {Array} [retrievalResult.facts] - Retrieved facts
   * @param {Array} [retrievalResult.procedures] - Retrieved procedures
   * @param {Object} [context] - Additional context
   * @returns {{ level: 'high'|'medium'|'low', score: number, reason: string }}
   */
  estimate(retrievalResult, context = {}) {
    if (!retrievalResult) {
      return { level: 'low', score: 0.2, reason: 'No retrieval data available' }
    }

    // Start from retrieval confidence if available
    if (retrievalResult.confidence) {
      const { level, score } = retrievalResult.confidence
      const resultCount = (retrievalResult.facts?.length || 0) +
        (retrievalResult.procedures?.length || 0) +
        (retrievalResult.episodes?.length || 0)

      let adjustedScore = score || 0.5
      let reason = `Retrieval confidence: ${level}`

      // Boost if many results found
      if (resultCount > 5) {
        adjustedScore = Math.min(1, adjustedScore + 0.1)
        reason += `, ${resultCount} results found`
      }

      // Penalize if no results
      if (resultCount === 0) {
        adjustedScore = Math.max(0, adjustedScore - 0.2)
        reason += ', no results found'
      }

      const adjustedLevel = adjustedScore >= 0.7 ? 'high' : adjustedScore >= 0.4 ? 'medium' : 'low'

      this.logger.info('confidence-estimator', 'estimated', {
        level: adjustedLevel,
        score: Math.round(adjustedScore * 100) / 100,
        resultCount
      })

      return {
        level: adjustedLevel,
        score: Math.round(adjustedScore * 100) / 100,
        reason
      }
    }

    // No retrieval confidence — estimate from result counts
    const factCount = retrievalResult.facts?.length || 0
    const score = Math.min(1, factCount * 0.15 + 0.2)
    const level = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low'

    return {
      level,
      score: Math.round(score * 100) / 100,
      reason: `Estimated from ${factCount} retrieved facts`
    }
  }

  /**
   * Estimate confidence with consciousness-enhanced relevance evaluation.
   * Promotes the pre-computed consciousness reason from ConfidenceScorer when
   * available (avoids a duplicate LLM call). Falls back to calling consciousness
   * directly, then to heuristic estimate().
   *
   * @param {Object} retrievalResult - Full result from RetrievalEngine.retrieve()
   * @param {string} [query] - The user's original query
   * @returns {Promise<{ level: 'none'|'low'|'medium'|'high', score: number, reason: string }>}
   */
  async estimateEnhanced(retrievalResult, query = '') {
    const heuristicResult = this.estimate(retrievalResult)

    // ConfidenceScorer already ran consciousness during retrieval — promote that result
    const consciousnessReason = retrievalResult?.confidence?.metadata?.consciousnessReason
    if (consciousnessReason) {
      const { level, score } = retrievalResult.confidence
      this.logger.debug('confidence-estimator', 'promoted_scorer_result', { level, score })
      return {
        level,
        score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)),
        reason: consciousnessReason
      }
    }

    // ConfidenceScorer ran heuristic-only (e.g. it failed) — try calling consciousness here
    if (!this.consciousness) return heuristicResult

    const totalResults = (retrievalResult?.facts?.length || 0) +
      (retrievalResult?.procedures?.length || 0) +
      (retrievalResult?.episodes?.length || 0)
    if (totalResults === 0) return heuristicResult

    const validLevels = ['none', 'low', 'medium', 'high']

    try {
      const topContent = [
        ...(retrievalResult.facts?.slice(0, 3).map(f => f.content || '') || []),
        ...(retrievalResult.episodes?.slice(0, 2).map(e => e.content || '') || [])
      ].filter(r => r.length > 0).join('\n---\n').slice(0, 1500)

      if (!topContent) return heuristicResult

      const result = await this.consciousness.evaluate('semantic-analyst', 'evaluate_confidence', {
        query: (query || '').slice(0, 500),
        results: topContent
      })

      if (result?.level && validLevels.includes(result.level) && typeof result.score === 'number') {
        this.logger.debug('confidence-estimator', 'consciousness_estimated', {
          level: result.level,
          score: result.score
        })
        return {
          level: result.level,
          score: Math.max(0, Math.min(1, Math.round(result.score * 100) / 100)),
          reason: result.reason || heuristicResult.reason
        }
      }
    } catch (error) {
      this.logger.warn('confidence-estimator', 'consciousness_failed', { error: error.message })
    }

    return heuristicResult
  }
}
