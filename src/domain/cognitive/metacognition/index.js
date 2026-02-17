import SelfMonitor from './self-monitor.js'
import ConfidenceEstimator from './confidence-estimator.js'
import ReflectionEngine from './reflection-engine.js'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * MetacognitionSystem - Facade for metacognitive capabilities
 *
 * Orchestrates three sub-components:
 * - SelfMonitor: heuristic quality gate for response evaluation
 * - ConfidenceEstimator: retrieval confidence assessment
 * - ReflectionEngine: sleep-cycle pattern analysis
 *
 * All evaluation is heuristic-based (zero LLM calls, zero latency cost).
 */
export default class MetacognitionSystem {
  constructor({ logger = defaultLogger, consciousness } = {}) {
    this.logger = logger
    this.selfMonitor = new SelfMonitor({ logger, consciousness })
    this.confidenceEstimator = new ConfidenceEstimator({ logger })
    this.reflectionEngine = new ReflectionEngine({ logger, consciousness })
  }

  /**
   * Evaluate response quality using heuristic signals.
   *
   * @param {string} response - The assistant's response text
   * @param {Object} [context] - Interaction context
   * @param {string} [context.userMessage] - The user's original message
   * @param {boolean} [context.hadMemory] - Whether memory was available
   * @returns {{ quality: 'good'|'uncertain'|'poor', signals: string[], score: number }}
   */
  evaluateResponse(response, context = {}) {
    return this.selfMonitor.evaluate(response, context)
  }

  /**
   * Estimate confidence in retrieval results.
   *
   * @param {Object} retrievalResult - Result from RetrievalEngine
   * @param {Object} [context] - Additional context
   * @returns {{ level: 'high'|'medium'|'low', score: number, reason: string }}
   */
  estimateConfidence(retrievalResult, context = {}) {
    return this.confidenceEstimator.estimate(retrievalResult, context)
  }

  /**
   * Evaluate response quality with consciousness-enhanced understanding.
   * Falls back to heuristic evaluateResponse() on any failure.
   *
   * @param {string} response - The assistant's response text
   * @param {Object} [context] - Interaction context
   * @returns {Promise<{ quality: 'good'|'uncertain'|'poor', signals: string[], score: number }>}
   */
  async evaluateResponseEnhanced(response, context = {}) {
    return this.selfMonitor.evaluateEnhanced(response, context)
  }

  /**
   * Reflect on sleep cycle results (runs during sleep).
   *
   * @param {Object} sleepResults - Results from sleep cycle phases
   * @returns {{ insights: string[], adjustments: Object[] }}
   */
  reflect(sleepResults) {
    return this.reflectionEngine.reflect(sleepResults)
  }

  /**
   * Reflect on sleep cycle results with consciousness-enhanced analysis.
   * Falls back to heuristic reflect() on any failure.
   *
   * @param {Object} sleepResults - Results from sleep cycle phases
   * @returns {Promise<{ insights: string[], adjustments: Object[] }>}
   */
  async reflectEnhanced(sleepResults) {
    return this.reflectionEngine.reflectEnhanced(sleepResults)
  }
}
