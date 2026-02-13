import WorkingMemory from './working-memory.js'
import EpisodicMemory from './episodic-memory.js'
import SemanticMemory from './semantic-memory.js'
import ProceduralMemory from './procedural-memory.js'
import defaultLogger from '../../logger.js'

/**
 * MemorySystem - Facade for 4 types of cognitive memory
 *
 * Provides unified interface to:
 * - Working Memory: Current task scratchpad
 * - Episodic Memory: Events with temporal context
 * - Semantic Memory: Facts and knowledge
 * - Procedural Memory: Learned patterns
 *
 * Phase 1: Delegates to existing MemoryStore (backward compatible)
 * Phase 3: Uses dedicated classes for each memory type
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
   * Phase 3: Delegates to SemanticMemory class
   */
  async getLongTermMemory() {
    return this.semantic.getLongTerm()
  }

  /**
   * Get recent semantic notes (last N days).
   * Phase 3: Delegates to SemanticMemory class
   */
  async getRecentDays(days = 3) {
    return this.semantic.getRecent(days)
  }

  /**
   * Add a semantic fact.
   * Phase 3: Delegates to SemanticMemory class
   */
  async addFact(fact) {
    await this.semantic.addFact(fact)
  }

  // --- Episodic Memory (chat-specific events) ---

  /**
   * Get chat-specific long-term memory.
   * Phase 3: Delegates to EpisodicMemory class
   */
  async getChatLongTermMemory(sessionId) {
    return this.episodic.getChatLongTerm(sessionId)
  }

  /**
   * Get recent chat-specific episodes.
   * Phase 3: Delegates to EpisodicMemory class
   */
  async getChatRecentDays(sessionId, days = 3) {
    return this.episodic.getChatRecent(sessionId, days)
  }

  /**
   * Add a chat-specific episode/fact.
   * Phase 3: Delegates to EpisodicMemory class
   */
  async addChatFact(sessionId, fact) {
    await this.episodic.addChatEpisode(sessionId, fact)
  }

  // --- Working Memory (session scratchpad) ---

  /**
   * Get working memory for a session.
   * Phase 3: Delegates to WorkingMemory class (includes staleness check)
   */
  async getWorkingMemory(sessionId) {
    return this.working.get(sessionId)
  }

  /**
   * Replace working memory for a session.
   * Phase 3: Delegates to WorkingMemory class
   */
  async replaceWorkingMemory(sessionId, content) {
    await this.working.replace(sessionId, content)
  }

  // --- Procedural Memory (learned patterns) ---

  /**
   * Get all learned patterns.
   * Phase 3: Delegates to ProceduralMemory class
   */
  async getPatterns() {
    return this.procedural.getAll()
  }

  /**
   * Match patterns against message.
   * Phase 3: Delegates to ProceduralMemory class
   */
  async matchPatterns(messageText) {
    return this.procedural.match(messageText)
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
    await this.semantic.writeLongTerm(content)
  }
}
