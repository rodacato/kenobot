import defaultLogger from '../../../infrastructure/logger.js'

/**
 * ConfidenceEstimator - Estimates confidence in retrieval results
 *
 * Integrates with RetrievalEngine confidence scores to provide
 * an overall confidence assessment for a given interaction.
 */
export default class ConfidenceEstimator {
  constructor({ logger = defaultLogger } = {}) {
    this.logger = logger
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
}
