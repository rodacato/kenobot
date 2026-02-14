import defaultLogger from '../../logger.js'

/**
 * ErrorAnalyzer - Analyzes errors from daily logs to extract lessons
 *
 * Process:
 * 1. Parse daily logs and episode memory for errors
 * 2. Classify errors (own vs external, recoverable vs fatal)
 * 3. Extract lessons learned
 * 4. Store as semantic facts
 *
 * Phase 4: Basic error detection and classification
 * Phase 6: Root cause analysis with LLM
 */
export default class ErrorAnalyzer {
  constructor(memorySystem, { logger = defaultLogger } = {}) {
    this.memory = memorySystem
    this.logger = logger
  }

  /**
   * Run error analysis on recent logs.
   *
   * @returns {Promise<{errorsFound: number, lessonsExtracted: number}>}
   */
  async run() {
    this.logger.info('error-analyzer', 'started', {})

    // Load recent episodes (last 1 day)
    const recentText = await this.memory.getRecentDays(1)
    const entries = this._parseEntries(recentText)

    let errorsFound = 0
    let lessonsExtracted = 0

    for (const entry of entries) {
      const lower = entry.toLowerCase()
      const hasError = lower.includes('error') || lower.includes('fail') ||
        lower.includes('exception') || lower.includes('crash')

      if (!hasError) continue
      errorsFound++

      const category = this.classifyError(entry)

      // Only extract lessons from internal/configuration errors (actionable)
      if (category === 'internal' || category === 'configuration') {
        const lesson = this.extractLesson(entry, category)
        if (lesson) {
          await this.memory.addFact(lesson)
          lessonsExtracted++
        }
      }
    }

    const result = { errorsFound, lessonsExtracted }
    this.logger.info('error-analyzer', 'completed', result)
    return result
  }

  /**
   * Parse markdown-formatted text into individual entries.
   * @private
   */
  _parseEntries(text) {
    if (!text) return []
    return text.split(/(?=## \d{2}:\d{2} —)/)
      .map(e => e.trim())
      .filter(e => e.length > 0)
  }

  /**
   * Classify error type.
   *
   * Categories:
   * - internal: Our code bugs
   * - external: API failures, network issues
   * - user: Invalid user input
   * - configuration: Missing config, invalid settings
   *
   * @param {string} errorMessage - Error message to classify
   * @returns {string} Error category
   */
  classifyError(errorMessage) {
    const lower = errorMessage.toLowerCase()

    if (lower.includes('network') || lower.includes('timeout') || lower.includes('econnrefused')) {
      return 'external'
    }

    if (lower.includes('config') || lower.includes('missing') || lower.includes('undefined')) {
      return 'configuration'
    }

    if (lower.includes('invalid') || lower.includes('unexpected')) {
      return 'user'
    }

    return 'internal'
  }

  /**
   * Extract lesson from error entry.
   *
   * @param {string} entry - Episode entry containing error
   * @param {string} category - Error category
   * @returns {string|null} Lesson learned or null
   */
  extractLesson(entry, category) {
    const lines = entry.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && (!l.startsWith('#') || /^## \d{2}:\d{2} —/.test(l)))

    const errorLine = lines.find(l => {
      const lower = l.toLowerCase()
      return lower.includes('error') || lower.includes('fail') ||
        lower.includes('exception') || lower.includes('crash')
    })

    if (!errorLine) return null

    const cleanError = errorLine.replace(/^## \d{2}:\d{2} — /, '').trim()
    if (cleanError.length < 10) return null

    const date = new Date().toISOString().slice(0, 10)
    const prefix = category === 'configuration' ? 'Configuration issue' : 'Error encountered'

    return `${prefix}: ${cleanError} (learned ${date})`
  }

  /**
   * Check if error is recoverable.
   *
   * @param {string} errorMessage - Error message
   * @returns {boolean}
   */
  isRecoverable(errorMessage) {
    const lower = errorMessage.toLowerCase()

    if (lower.includes('timeout') || lower.includes('temporary') || lower.includes('retry')) {
      return true
    }

    if (lower.includes('fatal') || lower.includes('cannot recover')) {
      return false
    }

    return true
  }
}
