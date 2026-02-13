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
 *   [SOUL.md] + [IDENTITY.md] + [User Profile] + [Available tools] + [Available skills] + [Memory]
 */
export default class ContextBuilder {
  constructor(config, storage, memoryManager, toolRegistry, skillLoader, identityLoader, { logger = defaultLogger } = {}) {
    this.config = config
    this.storage = storage
    this.memory = memoryManager || null
    this.toolRegistry = toolRegistry || null
    this.skillLoader = skillLoader || null
    this.identityLoader = identityLoader || null
    this.logger = logger
    this._identity = null
  }

  /**
   * Load identity files and cache them.
   * Called once at startup by AgentLoop.
   */
  async loadIdentity() {
    if (this.identityLoader) {
      await this.identityLoader.load()
      this.logger.info('context', 'identity_loaded', { loader: true })
    } else {
      // Legacy path: no IdentityLoader, read single file via storage
      const identityFile = this.config.identityFile || 'identities/kenobot'
      this._identity = await this.storage.readFile(identityFile)
      this.logger.info('context', 'identity_loaded', { file: identityFile, length: this._identity.length })
    }
  }

  /**
   * Build context for a provider call.
   * @param {string} sessionId - e.g. "telegram-123456789"
   * @param {Object} message - Incoming message { text, chatId, userId, ... }
   * @returns {{ system: string, messages: Array<{role: string, content: string}> }}
   */
  async build(sessionId, message) {
    // Ensure identity is loaded
    if (this.identityLoader) {
      if (!this.identityLoader.getSoul()) {
        await this.loadIdentity()
      }
    } else if (!this._identity) {
      await this.loadIdentity()
    }

    // Build system prompt: identity + tools + skills + memory
    const { system, activeSkill } = await this._buildSystemPrompt(message.text, sessionId)

    // Load session history
    const historyLimit = this.config.sessionHistoryLimit ?? 20
    const history = await this.storage.loadSession(sessionId, historyLimit)

    // Map history to provider format (strip timestamps)
    const messages = history.map(({ role, content }) => ({ role, content }))

    // Append current user message
    messages.push({ role: 'user', content: message.text })

    return { system, messages, activeSkill }
  }

  /**
   * Assemble system prompt from identity + pluggable prompt sections.
   * @private
   */
  async _buildSystemPrompt(messageText = '', sessionId = null) {
    const parts = []
    let activeSkill = null

    // Identity: IdentityLoader (modular) or legacy single file
    if (this.identityLoader) {
      const soul = this.identityLoader.getSoul()
      if (soul) parts.push(soul)

      const identity = this.identityLoader.getIdentity()
      if (identity) parts.push('\n---\n\n' + identity)

      const user = await this.identityLoader.getUser()
      if (user) {
        const userSection = [
          '\n---\n',
          '## User Profile\n',
          user + '\n',
          '_Learn something new? Save it: `<user>category: detail</user>` (one line, don\'t duplicate)_\n'
        ]
        parts.push(userSection.join('\n'))
      }

      // Bootstrap prompt for first-conversation onboarding
      const bootstrap = await this.identityLoader.getBootstrap()
      if (bootstrap) {
        this.logger.info('context', 'bootstrap_injected', { length: bootstrap.length })
        parts.push('\n---\n\n## First Conversation — Bootstrap\n' + bootstrap)
      }
    } else {
      parts.push(this._identity)
    }

    // Collect prompt sections from pluggable sources (tools, skills)
    const sectionContext = {
      messageText,
      sessionId,
      memoryDays: this.config.memoryDays ?? 3
    }

    const sources = [this.toolRegistry, this.skillLoader].filter(Boolean)
    const results = await Promise.allSettled(
      sources.map(s => s.getPromptSection(sectionContext))
    )

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'rejected') {
        this.logger.warn('context', 'source_failed', {
          source: sources[i].constructor?.name || 'unknown',
          error: result.reason?.message || String(result.reason)
        })
        continue
      }
      const section = result.value
      if (!section) continue
      parts.push(`\n---\n\n## ${section.label}\n${section.content}\n`)
      if (section.metadata?.activeSkill) activeSkill = section.metadata.activeSkill
    }

    // Memory section (built inline from CRUD methods)
    if (this.memory) {
      try {
        const memorySection = await this._buildMemorySection(sessionId, sectionContext.memoryDays)
        if (memorySection) {
          parts.push(`\n---\n\n## ${memorySection.label}\n${memorySection.content}\n`)
        }
      } catch (error) {
        this.logger.warn('context', 'source_failed', {
          source: 'Memory',
          error: error.message || String(error)
        })
      }
    }

    return { system: parts.join('\n'), activeSkill }
  }

  /**
   * Build memory section for system prompt from CRUD methods.
   * @private
   * @param {string|null} sessionId
   * @param {number} memoryDays
   * @returns {Promise<{ label: string, content: string }|null>}
   */
  async _buildMemorySection(sessionId, memoryDays = 3) {
    const promises = [
      this.memory.getLongTermMemory(),
      this.memory.getRecentDays(memoryDays)
    ]
    if (sessionId) {
      promises.push(this.memory.getChatLongTermMemory(sessionId))
      promises.push(this.memory.getChatRecentDays(sessionId, memoryDays))
      promises.push(this.memory.getWorkingMemory(sessionId))
    }

    const [longTerm, recentNotes, chatLongTerm, chatRecent, workingMemoryResult] = await Promise.all(promises)

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
