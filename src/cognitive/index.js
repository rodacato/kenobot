import MemorySystem from './memory/memory-system.js'
import RetrievalEngine from './retrieval/retrieval-engine.js'
import IdentityManager from './identity/identity-manager.js'
import defaultLogger from '../logger.js'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * CognitiveSystem - Main facade for cognitive architecture
 *
 * Orchestrates:
 * - Memory System (4 types: working, episodic, semantic, procedural)
 * - Retrieval Engine (Phase 2+)
 * - Identity Manager (Phase 5+)
 *
 * Phase 1: Delegates to existing MemoryStore (backward compatible)
 * Phase 2: Adds selective retrieval
 * Phase 3+: Will add identity management, sleep cycle
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

    // Phase 2: Initialize retrieval engine
    this.retrieval = new RetrievalEngine(this.memory, { logger })
    this.useRetrieval = config.useRetrieval !== false // Default: true

    // Phase 5: Initialize identity manager
    // Use config.identityFile if set, otherwise default to ~/.kenobot/memory/identity
    const identityPath = config.identityFile || join(homedir(), '.kenobot', 'memory', 'identity')
    this.identity = new IdentityManager(identityPath, provider, { logger })
    this.useIdentity = config.useIdentity !== false // Default: true
  }

  /**
   * Build context for a message.
   * Called by ContextBuilder to get memory for system prompt.
   *
   * Phase 1: Returns all memory (backward compatible)
   * Phase 2: Returns retrieval-based selective memory
   *
   * @param {string} sessionId - e.g. "telegram-123456"
   * @param {string} messageText - User message
   * @returns {Promise<{ memory: Object, workingMemory: Object|null, retrieval?: Object }>}
   */
  async buildContext(sessionId, messageText) {
    const workingMemory = await this.memory.getWorkingMemory(sessionId)

    // Phase 2: Use retrieval if enabled
    if (this.useRetrieval && messageText) {
      const limits = {
        maxFacts: this.config.maxFacts ?? 10,
        maxProcedures: this.config.maxProcedures ?? 5,
        maxEpisodes: this.config.maxEpisodes ?? 3
      }

      const retrieved = await this.retrieval.retrieve(sessionId, messageText, limits)

      this.logger.info('cognitive', 'retrieval_used', {
        sessionId,
        confidence: retrieved.confidence.level,
        resultCount: retrieved.facts.length + retrieved.procedures.length + retrieved.episodes.length
      })

      // Return retrieved memory in compatible format
      return {
        memory: {
          // Convert retrieved results to legacy format for ContextBuilder
          longTerm: this._formatRetrievedFacts(retrieved.facts),
          recentNotes: this._formatRetrievedEpisodes(retrieved.episodes),
          chatLongTerm: '',
          chatRecent: ''
        },
        workingMemory,
        retrieval: retrieved // Include full retrieval metadata
      }
    }

    // Phase 1: Load all memory (legacy path)
    const memoryDays = this.config.memoryDays ?? 3

    const [longTerm, recentNotes, chatLongTerm, chatRecent] = await Promise.all([
      this.memory.getLongTermMemory(),
      this.memory.getRecentDays(memoryDays),
      this.memory.getChatLongTermMemory(sessionId),
      this.memory.getChatRecentDays(sessionId, memoryDays)
    ])

    return {
      memory: {
        longTerm,
        recentNotes,
        chatLongTerm,
        chatRecent
      },
      workingMemory
    }
  }

  /**
   * Format retrieved facts for ContextBuilder.
   * @private
   */
  _formatRetrievedFacts(facts) {
    if (!facts || facts.length === 0) return ''

    const lines = ['# Retrieved Facts\n']
    for (const fact of facts) {
      lines.push(`- ${fact.content} (relevance: ${fact.score})`)
    }

    return lines.join('\n')
  }

  /**
   * Format retrieved episodes for ContextBuilder.
   * @private
   */
  _formatRetrievedEpisodes(episodes) {
    if (!episodes || episodes.length === 0) return ''

    return episodes.map(ep => ep.content).join('\n\n---\n\n')
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

  /**
   * Get identity manager.
   * @returns {IdentityManager}
   */
  getIdentityManager() {
    return this.identity
  }

  /**
   * Process message during bootstrap (if active).
   * Returns action to take (checkpoint, boundaries, complete).
   *
   * @param {string} sessionId
   * @param {string} message - User message
   * @param {Array<Object>} conversationHistory - Recent messages for inference
   * @returns {Promise<Object|null>} Bootstrap result or null if not bootstrapping
   */
  async processBootstrapIfActive(sessionId, message, conversationHistory = []) {
    // Check if bootstrap is active
    const isBootstrapping = await this.identity.isBootstrapping()
    if (!isBootstrapping) {
      return null
    }

    // Load bootstrap state from working memory (if exists)
    const bootstrapState = await this._loadBootstrapState(sessionId)
    if (bootstrapState) {
      this.identity.loadBootstrapState(bootstrapState)
    }

    // Process message
    const result = await this.identity.processBootstrapMessage(message, conversationHistory)

    // Save bootstrap state to working memory
    await this._saveBootstrapState(sessionId, this.identity.getBootstrapState())

    this.logger.info('cognitive', 'bootstrap_processed', {
      sessionId,
      phase: result.phase,
      action: result.action
    })

    return result
  }

  /**
   * Load bootstrap state from working memory.
   * @private
   */
  async _loadBootstrapState(sessionId) {
    try {
      const workingMemory = await this.memory.getWorkingMemory(sessionId)
      return workingMemory?.bootstrapState || null
    } catch (error) {
      this.logger.warn('cognitive', 'bootstrap_state_load_failed', {
        error: error.message
      })
      return null
    }
  }

  /**
   * Save bootstrap state to working memory.
   * @private
   */
  async _saveBootstrapState(sessionId, state) {
    try {
      const currentMemory = await this.memory.getWorkingMemory(sessionId) || {}
      currentMemory.bootstrapState = state

      await this.memory.replaceWorkingMemory(sessionId, JSON.stringify(currentMemory, null, 2))

      this.logger.info('cognitive', 'bootstrap_state_saved', {
        sessionId,
        phase: state.phase
      })
    } catch (error) {
      this.logger.error('cognitive', 'bootstrap_state_save_failed', {
        error: error.message
      })
    }
  }
}
