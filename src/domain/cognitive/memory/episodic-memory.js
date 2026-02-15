import defaultLogger from '../../../infrastructure/logger.js'

/**
 * EpisodicMemory - Memory of specific events with temporal context
 *
 * Phase 3: Wraps MemoryStore episodic methods
 * Future: Event boundary detection, structured episodes
 *
 * Types:
 * - Shared: Cross-chat episodes (episodic/shared/)
 * - Chat-specific: Per-session episodes (episodic/chats/{sessionId}/)
 */
export default class EpisodicMemory {
  constructor(memoryStore, { logger = defaultLogger } = {}) {
    this.store = memoryStore
    this.logger = logger
  }

  // --- Chat-specific episodes ---

  /**
   * Add a chat-specific episode/fact.
   *
   * @param {string} sessionId
   * @param {string} content - Episode content
   * @returns {Promise<void>}
   */
  async addChatEpisode(sessionId, content) {
    await this.store.appendChatDaily(sessionId, content)

    this.logger.info('episodic-memory', 'chat_episode_added', {
      sessionId,
      contentLength: content.length
    })
  }

  /**
   * Get recent chat-specific episodes.
   *
   * @param {string} sessionId
   * @param {number} days - Days to look back
   * @returns {Promise<string>} Markdown-formatted episodes
   */
  async getChatRecent(sessionId, days = 7) {
    return this.store.getChatRecentDays(sessionId, days)
  }

  /**
   * Get chat-specific long-term memory.
   *
   * @param {string} sessionId
   * @returns {Promise<string>} Long-term chat facts
   */
  async getChatLongTerm(sessionId) {
    return this.store.getChatLongTermMemory(sessionId)
  }

  // --- Shared episodes (global) ---

  /**
   * Add a shared episode (cross-chat).
   *
   * @param {string} content - Episode content
   * @returns {Promise<void>}
   */
  async addSharedEpisode(content) {
    await this.store.appendDaily(content)

    this.logger.info('episodic-memory', 'shared_episode_added', {
      contentLength: content.length
    })
  }

  /**
   * Get recent shared episodes.
   *
   * @param {number} days - Days to look back
   * @returns {Promise<string>} Markdown-formatted episodes
   */
  async getSharedRecent(days = 7) {
    return this.store.getRecentDays(days)
  }
}
