import defaultLogger from '../../logger.js'

/**
 * SelfMonitor - Heuristic quality gate for response evaluation
 *
 * Evaluates response quality using zero-cost heuristics (no LLM call).
 * Detects hedging, repetition, length anomalies, and missing context.
 */
export default class SelfMonitor {
  constructor({ logger = defaultLogger } = {}) {
    this.logger = logger
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

    this.logger.info('self-monitor', 'evaluated', { quality, score: Math.round(score * 100) / 100, signals })

    return { quality, signals, score: Math.round(score * 100) / 100 }
  }
}
