import defaultLogger from '../../../infrastructure/logger.js'

/**
 * ReflectionEngine - Analyzes patterns across interactions during sleep cycle
 *
 * Runs as part of the sleep cycle to generate insights about
 * interaction patterns, quality trends, and potential improvements.
 */
export default class ReflectionEngine {
  constructor({ logger = defaultLogger } = {}) {
    this.logger = logger
  }

  /**
   * Reflect on sleep cycle results and recent interactions.
   *
   * @param {Object} sleepResults - Results from sleep cycle phases
   * @param {Object} sleepResults.consolidation - Consolidator results
   * @param {Object} sleepResults.errorAnalysis - ErrorAnalyzer results
   * @param {Object} sleepResults.pruning - MemoryPruner results
   * @returns {{ insights: string[], adjustments: Object[] }}
   */
  reflect(sleepResults = {}) {
    const insights = []
    const adjustments = []

    const consolidation = sleepResults.consolidation || {}
    const errorAnalysis = sleepResults.errorAnalysis || {}
    const pruning = sleepResults.pruning || {}

    // Insight: memory growth pattern
    if ((consolidation.factsAdded || 0) > 5) {
      insights.push(`High learning rate: ${consolidation.factsAdded} new facts from ${consolidation.episodesProcessed} episodes`)
    }

    // Insight: error pattern
    if ((errorAnalysis.errorsFound || 0) > 0 && (errorAnalysis.lessonsExtracted || 0) === 0) {
      insights.push('Errors occurred but no lessons were extracted — error messages may not be descriptive enough')
      adjustments.push({
        type: 'error_handling',
        suggestion: 'Improve error message formatting to enable lesson extraction'
      })
    }

    // Insight: consolidation effectiveness
    if ((consolidation.episodesProcessed || 0) > 0) {
      const effectiveness = ((consolidation.factsAdded || 0) + (consolidation.patternsAdded || 0)) /
        consolidation.episodesProcessed
      if (effectiveness < 0.1) {
        insights.push('Consolidation effectiveness is low — most episodes are not producing facts or patterns')
        adjustments.push({
          type: 'memory_tagging',
          suggestion: 'Consider encouraging more specific memory tags in conversations'
        })
      }
    }

    // Insight: memory churn
    if ((pruning.patternsPruned || 0) > (consolidation.patternsAdded || 0)) {
      insights.push('More patterns pruned than added — learning and retention are not balanced')
      adjustments.push({
        type: 'pattern_quality',
        suggestion: 'Increase initial confidence threshold for new patterns'
      })
    }

    this.logger.info('reflection-engine', 'reflected', {
      insightCount: insights.length,
      adjustmentCount: adjustments.length
    })

    return { insights, adjustments }
  }
}
