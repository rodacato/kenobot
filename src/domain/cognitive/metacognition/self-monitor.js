import defaultLogger from '../../../infrastructure/logger.js'

/**
 * SelfMonitor - Heuristic quality gate for response evaluation
 *
 * Evaluates response quality using zero-cost heuristics (no LLM call).
 * Detects hedging, repetition, length anomalies, and missing context.
 */
export default class SelfMonitor {
  constructor({ logger = defaultLogger, consciousness } = {}) {
    this.logger = logger
    this.consciousness = consciousness || null
  }

  /**
   * Evaluate response quality.
   *
   * @param {string} response - The assistant's response text
   * @param {Object} context - Context about the interaction
   * @param {string} [context.userMessage] - The user's original message
   * @param {boolean} [context.hadMemory] - Whether memory was available
   * @returns {{ quality: 'good'|'uncertain'|'poor', signals: string[], score: number }}
   */
  evaluate(response, context = {}) {
    const signals = []
    let penalty = 0

    // Check: empty or very short response
    if (!response || response.trim().length < 10) {
      signals.push('response_too_short')
      penalty += 0.6
    }

    // Check: response too short relative to question
    if (context.userMessage && response) {
      const questionLength = context.userMessage.length
      const responseLength = response.length
      if (questionLength > 100 && responseLength < questionLength * 0.3) {
        signals.push('response_shorter_than_expected')
        penalty += 0.2
      }
    }

    // Check: hedging language
    const hedgingPatterns = [
      /\bi think\b/i,
      /\bmaybe\b/i,
      /\bnot sure\b/i,
      /\bi('m| am) not (certain|confident)\b/i,
      /\bprobably\b/i,
      /\bpossibly\b/i,
      /\bno (tengo|estoy) seguro/i,
      /\bcreo que\b/i,
      /\btal vez\b/i
    ]

    if (response) {
      const hedgeCount = hedgingPatterns.filter(p => p.test(response)).length
      if (hedgeCount >= 2) {
        signals.push('excessive_hedging')
        penalty += 0.3
      } else if (hedgeCount === 1) {
        signals.push('mild_hedging')
        penalty += 0.1
      }
    }

    // Check: repetition (response echoes the user's message)
    if (context.userMessage && response) {
      const strip = s => s.replace(/[^\w\s]/g, '')
      const userWords = new Set(strip(context.userMessage).toLowerCase().split(/\s+/).filter(w => w.length > 3))
      const responseWords = strip(response).toLowerCase().split(/\s+/).filter(w => w.length > 3)

      if (userWords.size > 0 && responseWords.length > 0) {
        const overlap = responseWords.filter(w => userWords.has(w)).length
        const overlapRatio = overlap / responseWords.length
        if (overlapRatio > 0.6) {
          signals.push('high_repetition')
          penalty += 0.2
        }
      }
    }

    // Check: missing context signals
    if (context.hadMemory === false) {
      signals.push('no_memory_context')
      penalty += 0.15
    }

    // Calculate quality
    const score = Math.max(0, 1 - penalty)
    let quality = 'good'
    if (score < 0.5) quality = 'poor'
    else if (score < 0.7) quality = 'uncertain'

    this.logger.debug('self-monitor', 'evaluated', { quality, score: Math.round(score * 100) / 100, signals })

    return { quality, signals, score: Math.round(score * 100) / 100 }
  }

  /**
   * Evaluate response quality with consciousness-enhanced understanding.
   * Falls back to heuristic evaluate() on any failure.
   *
   * @param {string} response - The assistant's response text
   * @param {Object} context - Context about the interaction
   * @returns {Promise<{ quality: 'good'|'uncertain'|'poor', signals: string[], score: number }>}
   */
  async evaluateEnhanced(response, context = {}) {
    const heuristicResult = this.evaluate(response, context)

    if (!this.consciousness) return heuristicResult
    if (!response || response.trim().length < 10) return heuristicResult

    const validQualities = ['good', 'uncertain', 'poor']

    try {
      const result = await this.consciousness.evaluate('quality-reviewer', 'evaluate_response', {
        response: response.slice(0, 1000),
        userMessage: (context.userMessage || '').slice(0, 500)
      })

      if (result?.quality && validQualities.includes(result.quality) &&
          typeof result.score === 'number' && Array.isArray(result.signals)) {
        this.logger.debug('self-monitor', 'consciousness_evaluated', {
          quality: result.quality,
          score: result.score
        })
        return {
          quality: result.quality,
          signals: result.signals,
          score: Math.max(0, Math.min(1, Math.round(result.score * 100) / 100))
        }
      }
    } catch (error) {
      this.logger.warn('self-monitor', 'consciousness_failed', { error: error.message })
    }

    return heuristicResult
  }
}
