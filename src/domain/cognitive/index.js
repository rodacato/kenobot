import MemorySystem from './memory/memory-system.js'
import RetrievalEngine from './retrieval/retrieval-engine.js'
import IdentityManager from './identity/identity-manager.js'
import SleepCycle from './consolidation/sleep-cycle.js'
import MetacognitionSystem from './metacognition/index.js'
import defaultLogger from '../../infrastructure/logger.js'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * CognitiveSystem - Main facade for cognitive architecture
 *
 * Orchestrates five sub-systems:
 * - Memory System (4 types: working, episodic, semantic, procedural)
 * - Identity System (core personality, behavioral rules, learned preferences)
 * - Retrieval Engine (keyword + confidence-based memory recall)
 * - Sleep Cycle (consolidation, error analysis, pruning, self-improvement)
 * - Metacognition (self-monitoring, confidence estimation, reflection)
 *
 * Usage:
 *   const cognitive = new CognitiveSystem(config, memoryStore, provider, { logger })
 *   const context = await cognitive.buildContext(sessionId, messageText)
 *   await cognitive.saveMemory(sessionId, memoryTags)
 */
export default class CognitiveSystem {
  constructor(config, memoryStore, provider, { logger = defaultLogger, identityPath: optIdentityPath, bus, toolRegistry } = {}) {
    this.config = config
    this.provider = provider
    this.logger = logger

    // Memory System
    this.memory = new MemorySystem(memoryStore, { logger })

    // Retrieval Engine
    this.retrieval = new RetrievalEngine(this.memory, { logger })
    this.useRetrieval = config.useRetrieval !== false // Default: true

    // Identity System
    const identityPath = optIdentityPath || join(homedir(), '.kenobot', 'memory', 'identity')
    this.identity = new IdentityManager(identityPath, provider, { logger })
    this.useIdentity = config.useIdentity !== false // Default: true

    // Sleep Cycle (consolidation + self-improvement with Motor System integration)
    const selfRepo = config.motor?.selfRepo || ''
    this.sleepCycle = new SleepCycle(this.memory, { logger, dataDir: config.dataDir, bus, toolRegistry, repo: selfRepo })

    // Metacognition (self-monitoring, confidence, reflection)
    this.metacognition = new MetacognitionSystem({ logger })
  }

  /**
   * Build context for a message.
   * Called by ContextBuilder to get memory for system prompt.
   *
   * With retrieval enabled: returns keyword-matched selective memory.
   * Without retrieval: loads all memory (full context).
   * Bootstrap mode: returns empty memory (identity takes priority).
   *
   * @param {string} sessionId - e.g. "telegram-123456"
   * @param {string} messageText - User message
   * @returns {Promise<{ memory: Object, workingMemory: Object|null, retrieval?: Object, isBootstrapping?: boolean }>}
   */
  async buildContext(sessionId, messageText) {
    // CRITICAL: Check if we're in bootstrap mode FIRST
    // During bootstrap, we should NOT load memory - only identity
    const isBootstrapping = await this.identity.isBootstrapping()

    if (isBootstrapping) {
      this.logger.info('cognitive', 'bootstrap_mode', {
        sessionId,
        message: 'Skipping memory load - bootstrap in progress'
      })

      return {
        memory: {
          longTerm: '',
          recentNotes: '',
          chatLongTerm: '',
          chatRecent: '',
          chatContext: ''
        },
        workingMemory: null,
        isBootstrapping: true
      }
    }

    const workingMemory = await this.memory.getWorkingMemory(sessionId)
    const chatContext = await this.memory.getChatContext(sessionId)

    // Selective retrieval (keyword-based)
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

      // Return retrieved memory in ContextBuilder-compatible format
      return {
        memory: {
          longTerm: this._formatRetrievedFacts(retrieved.facts),
          recentNotes: this._formatRetrievedEpisodes(retrieved.episodes),
          chatLongTerm: '',
          chatRecent: '',
          chatContext
        },
        workingMemory,
        retrieval: retrieved, // Include full retrieval metadata
        isBootstrapping: false
      }
    }

    // Full memory load (no retrieval filtering)
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
        chatRecent,
        chatContext
      },
      workingMemory,
      isBootstrapping: false
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
   * Get sleep cycle.
   * @returns {SleepCycle}
   */
  getSleepCycle() {
    return this.sleepCycle
  }

  /**
   * Get metacognition system.
   * @returns {MetacognitionSystem}
   */
  getMetacognition() {
    return this.metacognition
  }

  /**
   * Run sleep cycle (convenience method).
   * @returns {Promise<Object>} Sleep cycle results
   */
  async runSleepCycle() {
    return this.sleepCycle.run()
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
      if (!workingMemory?.content) return null
      const data = JSON.parse(workingMemory.content)
      return data.bootstrapState || null
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
      let data = {}
      const workingMemory = await this.memory.getWorkingMemory(sessionId)
      if (workingMemory?.content) {
        try { data = JSON.parse(workingMemory.content) } catch { data = {} }
      }
      data.bootstrapState = state

      await this.memory.replaceWorkingMemory(sessionId, JSON.stringify(data, null, 2))

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
