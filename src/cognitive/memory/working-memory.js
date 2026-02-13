import defaultLogger from '../../logger.js'

/**
 * WorkingMemory - Short-term scratchpad for current task
 *
 * Phase 3: Wraps MemoryStore working memory methods
 * Future: Could add structured format (task, context, pending, notes)
 *
 * Retention: 7 days by default (stale threshold)
 */
export default class WorkingMemory {
  constructor(memoryStore, { logger = defaultLogger, staleThreshold = 7 } = {}) {
    this.store = memoryStore
    this.logger = logger
    this.staleThreshold = staleThreshold // days
  }

  /**
   * Get working memory for a session.
   * Returns null if not found or stale.
   *
   * @param {string} sessionId
   * @returns {Promise<{content: string, updatedAt: number}|null>}
   */
  async get(sessionId) {
    const result = await this.store.getWorkingMemory(sessionId)

    if (!result) return null

    // Check staleness
    const ageDays = (Date.now() - result.updatedAt) / (1000 * 60 * 60 * 24)
    if (ageDays > this.staleThreshold) {
      this.logger.warn('working-memory', 'stale', {
        sessionId,
        ageDays: Math.floor(ageDays),
        threshold: this.staleThreshold
      })
      return null
    }

    return result
  }

  /**
   * Replace working memory for a session.
   *
   * @param {string} sessionId
   * @param {string} content - Working memory content
   * @returns {Promise<void>}
   */
  async replace(sessionId, content) {
    await this.store.writeWorkingMemory(sessionId, content)

    this.logger.info('working-memory', 'replaced', {
      sessionId,
      contentLength: content.length
    })
  }

  /**
   * Clear working memory for a session.
   *
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async clear(sessionId) {
    await this.store.writeWorkingMemory(sessionId, '')

    this.logger.info('working-memory', 'cleared', { sessionId })
  }

  /**
   * Check if working memory exists and is not stale.
   *
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  async exists(sessionId) {
    const memory = await this.get(sessionId)
    if (memory === null) return false
    if (!memory.content || memory.content.trim().length === 0) return false
    return true
  }
}
