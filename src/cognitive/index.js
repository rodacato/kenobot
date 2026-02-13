import MemorySystem from './memory/memory-system.js'
import defaultLogger from '../logger.js'

/**
 * CognitiveSystem - Main facade for cognitive architecture
 *
 * Orchestrates:
 * - Memory System (4 types: working, episodic, semantic, procedural)
 * - Retrieval Engine (Phase 2+)
 * - Identity Manager (Phase 2+)
 *
 * Phase 1: Delegates to existing MemoryStore (backward compatible)
 * Phase 2+: Will add retrieval, identity management, sleep cycle
 *
 * Usage:
 *   const cognitive = new CognitiveSystem(config, memoryStore, provider, { logger })
 *   const context = await cognitive.buildContext(sessionId, messageText)
 *   await cognitive.saveMemory(sessionId, memoryTags)
 */
export default class CognitiveSystem {
  constructor(config, memoryStore, provider, { logger = defaultLogger } = {}) {
    this.config = config
    this.provider = provider
    this.logger = logger

    // Initialize memory system
    this.memory = new MemorySystem(memoryStore, { logger })

    // Phase 2+: Will add
    // this.retrieval = new RetrievalEngine(...)
    // this.identity = new IdentityManager(...)
  }

  /**
   * Build context for a message.
   * Called by ContextBuilder to get memory for system prompt.
   *
   * Phase 1: Returns all memory (backward compatible)
   * Phase 2+: Returns retrieval-based selective memory
   *
   * @param {string} sessionId - e.g. "telegram-123456"
   * @param {string} messageText - User message
   * @returns {Promise<{ memory: Object, workingMemory: Object|null }>}
   */
  async buildContext(sessionId, messageText) {
    // Phase 1: Load all memory (same as before)
    const memoryDays = this.config.memoryDays ?? 3

    const [longTerm, recentNotes, chatLongTerm, chatRecent, workingMemory] = await Promise.all([
      this.memory.getLongTermMemory(),
      this.memory.getRecentDays(memoryDays),
      this.memory.getChatLongTermMemory(sessionId),
      this.memory.getChatRecentDays(sessionId, memoryDays),
      this.memory.getWorkingMemory(sessionId)
    ])

    // Phase 1: Return in same format as before (for ContextBuilder compatibility)
    return {
      memory: {
        longTerm,
        recentNotes,
        chatLongTerm,
        chatRecent
      },
      workingMemory
    }

    // Phase 2: Will use retrieval engine
    // const retrieved = await this.retrieval.retrieve(sessionId, messageText, {
    //   maxFacts: 10,
    //   maxProcedures: 5,
    //   maxEpisodes: 3
    // })
    // return { memory: retrieved, workingMemory }
  }

  /**
   * Save memory from assistant response tags.
   * Called by AgentLoop after processing response.
   *
   * @param {string} sessionId
   * @param {Object} memoryTags - Extracted tags from response
   * @param {string[]} [memoryTags.memory] - Global facts
   * @param {string[]} [memoryTags.chatMemory] - Chat-specific facts
   * @param {string} [memoryTags.workingMemory] - Working memory content
   */
  async saveMemory(sessionId, memoryTags) {
    // Global facts (semantic memory)
    if (memoryTags.memory?.length) {
      for (const fact of memoryTags.memory) {
        await this.memory.addFact(fact)
      }
      this.logger.info('cognitive', 'memory_saved', {
        sessionId,
        type: 'semantic',
        count: memoryTags.memory.length
      })
    }

    // Chat-specific facts (episodic memory)
    if (memoryTags.chatMemory?.length) {
      for (const fact of memoryTags.chatMemory) {
        await this.memory.addChatFact(sessionId, fact)
      }
      this.logger.info('cognitive', 'memory_saved', {
        sessionId,
        type: 'episodic',
        count: memoryTags.chatMemory.length
      })
    }

    // Working memory (scratchpad)
    if (memoryTags.workingMemory) {
      await this.memory.replaceWorkingMemory(sessionId, memoryTags.workingMemory)
      this.logger.info('cognitive', 'memory_saved', {
        sessionId,
        type: 'working'
      })
    }
  }

  /**
   * Get memory system (for compaction, testing).
   * @returns {MemorySystem}
   */
  getMemorySystem() {
    return this.memory
  }
}
