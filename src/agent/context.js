import defaultLogger from '../logger.js'

/**
 * ContextBuilder - Assembles system prompt and message history for providers
 *
 * Returns provider-agnostic { system, messages } format.
 * Each provider adapts this to its own API:
 *   - claude-api: native system param + messages array
 *   - claude-cli: prepends system to prompt string
 *   - mock: ignores system, pattern-matches last message
 *
 * System prompt structure:
 *   [Core Identity] + [Behavioral Rules] + [Preferences] + [Bootstrap] + [Memory]
 *
 * Uses CognitiveSystem for all identity and memory operations.
 */
export default class ContextBuilder {
  constructor(config, storage, cognitive, { logger = defaultLogger } = {}) {
    this.config = config
    this.storage = storage
    this.cognitive = cognitive
    this.memory = cognitive ? cognitive.getMemorySystem() : null
    this.logger = logger

    if (cognitive) {
      logger.info('context', 'cognitive_system_ready')
    }
  }

  /**
   * Build context for a provider call.
   * @param {string} sessionId - e.g. "telegram-123456789"
   * @param {Object} message - Incoming message { text, chatId, userId, ... }
   * @returns {{ system: string, messages: Array<{role: string, content: string}> }}
   */
  async build(sessionId, message) {
    // Build system prompt: identity + memory
    const system = await this._buildSystemPrompt(message.text, sessionId)

    // Load session history
    const historyLimit = this.config.sessionHistoryLimit ?? 20
    const history = await this.storage.loadSession(sessionId, historyLimit)

    // Map history to provider format (strip timestamps)
    const messages = history.map(({ role, content }) => ({ role, content }))

    // Append current user message
    messages.push({ role: 'user', content: message.text })

    return { system, messages }
  }

  /**
   * Assemble system prompt from identity + memory.
   * @private
   */
  async _buildSystemPrompt(messageText = '', sessionId = null) {
    const parts = []

    // Identity: Load from CognitiveSystem IdentityManager (if available)
    let isBootstrapping = false
    if (this.cognitive) {
      const identityManager = this.cognitive.getIdentityManager()
      const { core, behavioralRules, preferences, bootstrap, isBootstrapping: bootstrapping } = await identityManager.buildContext()

      isBootstrapping = bootstrapping

      if (core) parts.push(core)
      if (behavioralRules) parts.push('\n---\n\n' + behavioralRules)

      // During bootstrap: Skip preferences, only show bootstrap instructions
      if (isBootstrapping && bootstrap) {
        this.logger.info('context', 'bootstrap_mode', {
          message: 'First conversation - skipping preferences and memory'
        })
        parts.push('\n---\n\n## First Conversation — Bootstrap\n' + bootstrap)
      } else if (!isBootstrapping && preferences) {
        // Normal mode: Load preferences
        parts.push('\n---\n\n## Preferences\n' + preferences)
      }
    }

    // Memory section (built inline from CRUD methods)
    // SKIP during bootstrap - identity must be established first
    const memoryDays = this.config.memoryDays ?? 3
    if (this.memory && !isBootstrapping) {
      try {
        const memorySection = await this._buildMemorySection(sessionId, memoryDays, messageText)
        if (memorySection) {
          parts.push(`\n---\n\n## ${memorySection.label}\n${memorySection.content}\n`)
        }
      } catch (error) {
        this.logger.warn('context', 'source_failed', {
          source: 'Memory',
          error: error.message || String(error)
        })
      }
    } else if (isBootstrapping) {
      this.logger.info('context', 'memory_skipped', {
        reason: 'bootstrap_in_progress'
      })
    }

    return parts.join('\n')
  }

  /**
   * Build memory section for system prompt from CRUD methods.
   * @private
   * @param {string|null} sessionId
   * @param {number} memoryDays
   * @param {string} messageText - User message for retrieval
   * @returns {Promise<{ label: string, content: string }|null>}
   */
  async _buildMemorySection(sessionId, memoryDays = 3, messageText = '') {
    // Use CognitiveSystem to build memory context (if available)
    if (!this.cognitive) return null

    const context = await this.cognitive.buildContext(sessionId, messageText)
    const longTerm = context.memory.longTerm
    const recentNotes = context.memory.recentNotes
    const chatLongTerm = context.memory.chatLongTerm
    const chatRecent = context.memory.chatRecent
    const workingMemoryResult = context.workingMemory

    // Filter stale working memory (>7 days by default)
    const staleDays = this.config.workingMemoryStaleThreshold ?? 7
    const workingMemory = this._filterWorkingMemory(workingMemoryResult, staleDays)

    if (!longTerm && !recentNotes && !chatLongTerm && !chatRecent && !workingMemory) return null

    const lines = [
      '### Memory tags',
      'Include these in your response when something is worth remembering:\n',
      '| Tag | Use for | Scope |',
      '|-----|---------|-------|',
      '| `<memory>fact</memory>` | Important facts, decisions, context | Global, forever |',
      '| `<chat-memory>fact</chat-memory>` | Chat-specific context | This conversation only |',
      '| `<working-memory>bullets</working-memory>` | Current task, pending items | Scratchpad (replaces previous) |\n',
      '_Use sparingly. One line per fact. Don\'t duplicate what\'s already saved._\n'
    ]

    if (longTerm) {
      lines.push('### Long-term memory')
      lines.push(longTerm + '\n')
    }
    if (recentNotes) {
      lines.push('### Recent notes')
      lines.push(recentNotes + '\n')
    }
    if (chatLongTerm) {
      lines.push('### Chat-specific memory')
      lines.push(chatLongTerm + '\n')
    }
    if (chatRecent) {
      lines.push('### Chat-specific notes')
      lines.push(chatRecent + '\n')
    }
    if (workingMemory) {
      const ageLabel = this._formatAge(workingMemory.updatedAt)
      lines.push(`### Working memory (updated ${ageLabel})`)
      lines.push(workingMemory.content)
    }

    return { label: 'Memory', content: lines.join('\n') }
  }

  /**
   * Filter working memory by staleness threshold.
   * @private
   * @param {{ content: string, updatedAt: number }|null} result
   * @param {number} staleDays - Max age in days before excluding
   * @returns {{ content: string, updatedAt: number }|null}
   */
  _filterWorkingMemory(result, staleDays) {
    if (!result) return null
    const ageDays = (Date.now() - result.updatedAt) / 86400000
    if (ageDays > staleDays) return null
    return result
  }

  /**
   * Format a timestamp as a human-readable relative age.
   * @private
   * @param {number} timestampMs
   * @returns {string} e.g. "2 hours ago", "3 days ago"
   */
  _formatAge(timestampMs) {
    const diffMs = Date.now() - timestampMs
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.floor(hours / 24)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }
}
