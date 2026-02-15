import defaultLogger from '../../../infrastructure/logger.js'

/**
 * ProceduralMemory - Learned behavioral patterns
 *
 * Patterns:
 * - Trigger: Condition to activate ("n8n + 401 error")
 * - Response: Suggested action ("Check ?token= query param first")
 * - Confidence: How reliable (0.0 - 1.0)
 * - Usage count: How often used
 * - Learned from: Source episode
 *
 * Persisted at: data/memory/procedural/patterns.json
 */
export default class ProceduralMemory {
  constructor(memoryStore, { logger = defaultLogger } = {}) {
    this.store = memoryStore
    this.logger = logger
    this.patterns = []
    this._loaded = false
  }

  /**
   * Load patterns from store on first access.
   * @private
   */
  async _ensureLoaded() {
    if (this._loaded) return
    if (this.store.readPatterns) {
      this.patterns = await this.store.readPatterns()
    }
    this._loaded = true
  }

  /**
   * Persist current patterns to store.
   * @private
   */
  async _persist() {
    if (this.store.writePatterns) {
      await this.store.writePatterns(this.patterns)
    }
  }

  /**
   * Get all learned patterns.
   *
   * @returns {Promise<Array<{id: string, trigger: string, response: string, confidence: number}>>}
   */
  async getAll() {
    await this._ensureLoaded()
    return this.patterns
  }

  /**
   * Match patterns against message text.
   * Returns patterns whose trigger keywords appear in the message.
   *
   * @param {string} messageText
   * @returns {Promise<Array<{id: string, trigger: string, response: string, confidence: number, score: number}>>}
   */
  async match(messageText) {
    await this._ensureLoaded()
    if (!messageText || this.patterns.length === 0) return []

    const messageLower = messageText.toLowerCase()
    const matched = []

    for (const pattern of this.patterns) {
      const triggerWords = pattern.trigger
        .toLowerCase()
        .split(/[\s+,]+/)
        .filter(w => w.length > 2)

      let score = 0
      for (const word of triggerWords) {
        if (messageLower.includes(word)) {
          score += 1
        }
      }

      if (score > 0 && triggerWords.length > 0) {
        const coverage = score / triggerWords.length
        matched.push({
          ...pattern,
          score: coverage * pattern.confidence
        })
      }
    }

    return matched
      .sort((a, b) => b.score - a.score)
  }

  /**
   * Add a new learned pattern.
   *
   * @param {Object} pattern
   * @param {string} pattern.id
   * @param {string} pattern.trigger
   * @param {string} pattern.response
   * @param {number} pattern.confidence
   * @param {string} [pattern.learnedFrom]
   * @returns {Promise<void>}
   */
  async add(pattern) {
    if (!pattern.id || !pattern.trigger || !pattern.response) {
      throw new Error('Pattern must have id, trigger, and response')
    }

    if (typeof pattern.confidence !== 'number' || pattern.confidence < 0 || pattern.confidence > 1) {
      throw new Error('Pattern confidence must be a number between 0 and 1')
    }

    await this._ensureLoaded()

    this.patterns.push({
      ...pattern,
      usageCount: pattern.usageCount || 0,
      createdAt: new Date().toISOString()
    })

    await this._persist()

    this.logger.info('procedural-memory', 'pattern_added', {
      id: pattern.id,
      trigger: pattern.trigger.slice(0, 50)
    })
  }

  /**
   * Remove a pattern by ID.
   *
   * @param {string} id
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  async remove(id) {
    await this._ensureLoaded()

    const index = this.patterns.findIndex(p => p.id === id)
    if (index === -1) return false

    this.patterns.splice(index, 1)
    await this._persist()

    this.logger.info('procedural-memory', 'pattern_removed', { id })
    return true
  }
}
