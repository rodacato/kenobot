import WorkingMemory from './working-memory.js'
import EpisodicMemory from './episodic-memory.js'
import SemanticMemory from './semantic-memory.js'
import ProceduralMemory from './procedural-memory.js'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * MemorySystem - Facade for 4 types of cognitive memory
 *
 * Provides unified interface to:
 * - Working Memory: Current task scratchpad
 * - Episodic Memory: Events with temporal context
 * - Semantic Memory: Facts and knowledge
 * - Procedural Memory: Learned patterns
 *
 * Each memory type delegates to MemoryStore for persistence.
 */
export default class MemorySystem {
  constructor(memoryStore, { logger = defaultLogger, workingStaleThreshold = 7 } = {}) {
    this.store = memoryStore
    this.logger = logger

    // Initialize 4 memory types
    this.working = new WorkingMemory(memoryStore, { logger, staleThreshold: workingStaleThreshold })
    this.episodic = new EpisodicMemory(memoryStore, { logger })
    this.semantic = new SemanticMemory(memoryStore, { logger })
    this.procedural = new ProceduralMemory(memoryStore, { logger })
  }

  // --- Semantic Memory (global facts) ---

  /**
   * Get long-term semantic memory (facts, knowledge).
   */
  async getLongTermMemory() {
    return this.semantic.getLongTerm()
  }

  /**
   * Get recent semantic notes (last N days).
   */
  async getRecentDays(days = 3) {
    return this.semantic.getRecent(days)
  }

  /**
   * Add a semantic fact.
   */
  async addFact(fact) {
    await this.semantic.addFact(fact)
  }

  // --- Episodic Memory (chat-specific events) ---

  /**
   * Get chat-specific long-term memory.
   */
  async getChatLongTermMemory(sessionId) {
    return this.episodic.getChatLongTerm(sessionId)
  }

  /**
   * Get recent chat-specific episodes.
   */
  async getChatRecentDays(sessionId, days = 3) {
    return this.episodic.getChatRecent(sessionId, days)
  }

  /**
   * Add a chat-specific episode/fact.
   */
  async addChatFact(sessionId, fact) {
    await this.episodic.addChatEpisode(sessionId, fact)
  }

  // --- Chat Context ---

  /**
   * Get chat context description.
   * @param {string} sessionId
   * @returns {Promise<string>} Context markdown or empty string
   */
  async getChatContext(sessionId) {
    return this.store.getChatContext(sessionId)
  }

  /**
   * Set (replace) chat context description.
   * @param {string} sessionId
   * @param {string} content
   */
  async setChatContext(sessionId, content) {
    await this.store.setChatContext(sessionId, content)
  }

  // --- Working Memory (session scratchpad) ---

  /**
   * Get working memory for a session.
   * Includes staleness check (returns null if older than threshold).
   */
  async getWorkingMemory(sessionId) {
    return this.working.get(sessionId)
  }

  /**
   * Replace working memory for a session.
   */
  async replaceWorkingMemory(sessionId, content) {
    await this.working.replace(sessionId, content)
  }

  // --- Procedural Memory (learned patterns) ---

  /**
   * Get all learned patterns.
   */
  async getPatterns() {
    return this.procedural.getAll()
  }

  /**
   * Match patterns against message.
   */
  async matchPatterns(messageText) {
    return this.procedural.match(messageText)
  }

  // --- Compaction ---

  /**
   * List all daily logs (for compaction).
   */
  async listDailyLogs() {
    return this.store.listDailyLogs()
  }

  /**
   * Read a specific daily log.
   */
  async readDailyLog(filename) {
    return this.store.readDailyLog(filename)
  }

  /**
   * Write long-term memory (for compaction).
   */
  async writeLongTermMemory(content) {
    await this.semantic.writeLongTerm(content)
  }
}
