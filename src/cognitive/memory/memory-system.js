import defaultLogger from '../../logger.js'

/**
 * MemorySystem - Facade for 4 types of cognitive memory
 *
 * Provides unified interface to:
 * - Working Memory: Current task scratchpad
 * - Episodic Memory: Events with temporal context
 * - Semantic Memory: Facts and knowledge
 * - Procedural Memory: Learned patterns (Phase 2+)
 *
 * Phase 1: Delegates to existing MemoryStore (backward compatible)
 * Phase 3: Each memory type will be separate class
 */
export default class MemorySystem {
  constructor(memoryStore, { logger = defaultLogger } = {}) {
    this.store = memoryStore
    this.logger = logger
  }

  // --- Semantic Memory (global facts) ---

  /**
   * Get long-term semantic memory (facts, knowledge).
   * Phase 1: Returns MEMORY.md content
   * Phase 3: Returns memory/semantic/facts.md with retrieval
   */
  async getLongTermMemory() {
    return this.store.readLongTermMemory()
  }

  /**
   * Get recent semantic notes (last N days).
   * Phase 1: Returns recent daily logs
   * Phase 3: Returns consolidated semantic memory
   */
  async getRecentDays(days = 3) {
    return this.store.getRecentDays(days)
  }

  /**
   * Add a semantic fact.
   * Phase 1: Appends to daily log
   * Phase 3: Appends to memory/semantic/facts.md
   */
  async addFact(fact) {
    await this.store.appendDaily(fact)
    this.logger.info('memory-system', 'fact_added', { fact: fact.slice(0, 100) })
  }

  // --- Episodic Memory (chat-specific events) ---

  /**
   * Get chat-specific long-term memory.
   * Phase 1: Returns chats/{sessionId}/MEMORY.md
   * Phase 3: Returns memory/episodic/chats/{sessionId}/facts.md
   */
  async getChatLongTermMemory(sessionId) {
    return this.store.getChatLongTermMemory(sessionId)
  }

  /**
   * Get recent chat-specific episodes.
   * Phase 1: Returns recent chat daily logs
   * Phase 3: Returns memory/episodic/chats/{sessionId}/YYYY-MM-DD.md with retrieval
   */
  async getChatRecentDays(sessionId, days = 3) {
    return this.store.getChatRecentDays(sessionId, days)
  }

  /**
   * Add a chat-specific episode/fact.
   * Phase 1: Appends to chat daily log
   * Phase 3: Appends to episodic memory with event boundary detection
   */
  async addChatFact(sessionId, fact) {
    await this.store.appendChatDaily(sessionId, fact)
    this.logger.info('memory-system', 'chat_fact_added', { sessionId, fact: fact.slice(0, 100) })
  }

  // --- Working Memory (session scratchpad) ---

  /**
   * Get working memory for a session.
   * Phase 1: Returns { content, updatedAt } from working/{sessionId}.md
   * Phase 3: Returns structured { task, context, pending, notes } from working/{sessionId}.json
   */
  async getWorkingMemory(sessionId) {
    return this.store.getWorkingMemory(sessionId)
  }

  /**
   * Replace working memory for a session.
   * Phase 1: Writes to working/{sessionId}.md
   * Phase 3: Writes structured JSON to working/{sessionId}.json
   */
  async replaceWorkingMemory(sessionId, content) {
    await this.store.writeWorkingMemory(sessionId, content)
    this.logger.info('memory-system', 'working_memory_replaced', { sessionId })
  }

  // --- Procedural Memory (learned patterns) ---
  // Phase 2+: Will be implemented with patterns.json

  /**
   * Get all learned patterns.
   * Phase 1: Returns empty array (not implemented)
   * Phase 2: Returns memory/procedural/patterns.json
   */
  async getPatterns() {
    // Phase 2
    return []
  }

  /**
   * Match patterns against message.
   * Phase 1: No-op
   * Phase 2: Returns activated patterns
   */
  async matchPatterns(messageText) {
    // Phase 2
    return []
  }

  // --- Compaction (for existing CompactingMemory) ---

  /**
   * List all daily logs (for compaction).
   * Phase 1: Delegates to store
   * Phase 3: Will handle new structure
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
    await this.store.writeLongTermMemory(content)
  }
}
