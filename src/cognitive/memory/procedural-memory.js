import defaultLogger from '../../logger.js'

/**
 * ProceduralMemory - Learned behavioral patterns
 *
 * Phase 3: Placeholder (patterns.json structure defined)
 * Phase 4: Will be populated by SleepCycle consolidation
 *
 * Patterns:
 * - Trigger: Condition to activate ("n8n + 401 error")
 * - Response: Suggested action ("Check ?token= query param first")
 * - Confidence: How reliable (0.0 - 1.0)
 * - Usage count: How often used
 * - Learned from: Source episode
 *
 * Future file: memory/procedural/patterns.json
 */
export default class ProceduralMemory {
  constructor(memoryStore, { logger = defaultLogger } = {}) {
    this.store = memoryStore
    this.logger = logger
    this.patterns = [] // In-memory cache
  }

  /**
   * Get all learned patterns.
   * Phase 3: Returns empty array (not implemented yet)
   * Phase 4: Will load from patterns.json
   *
   * @returns {Promise<Array<{id: string, trigger: string, response: string, confidence: number}>>}
   */
  async getAll() {
    // Phase 4: Load from store
    return this.patterns
  }

  /**
   * Match patterns against message text.
   * Phase 3: Returns empty array (not implemented yet)
   * Phase 4: Will use pattern matching logic
   *
   * @param {string} messageText
   * @returns {Promise<Array<{id: string, trigger: string, response: string, confidence: number}>>}
   */
  async match(messageText) {
    // Phase 4: Implement pattern matching
    // For now, return empty
    return []
  }

  /**
   * Add a new learned pattern.
   * Phase 3: No-op (store in memory only)
   * Phase 4: Will persist to patterns.json
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
    // Validate pattern
    if (!pattern.id || !pattern.trigger || !pattern.response) {
      throw new Error('Pattern must have id, trigger, and response')
    }

    if (typeof pattern.confidence !== 'number' || pattern.confidence < 0 || pattern.confidence > 1) {
      throw new Error('Pattern confidence must be a number between 0 and 1')
    }

    // Add to in-memory cache
    this.patterns.push({
      ...pattern,
      usageCount: pattern.usageCount || 0,
      createdAt: new Date().toISOString()
    })

    this.logger.info('procedural-memory', 'pattern_added', {
      id: pattern.id,
      trigger: pattern.trigger.slice(0, 50)
    })

    // Phase 4: Persist to patterns.json
  }

  /**
   * Remove a pattern by ID.
   *
   * @param {string} id
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  async remove(id) {
    const index = this.patterns.findIndex(p => p.id === id)

    if (index === -1) return false

    this.patterns.splice(index, 1)

    this.logger.info('procedural-memory', 'pattern_removed', { id })

    // Phase 4: Persist changes
    return true
  }
}
