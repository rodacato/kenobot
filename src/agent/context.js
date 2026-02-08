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
          '### How to update user preferences',
          'When you learn a user preference or profile fact, include it in your response:\n',
          '<user>Preference category: detail</user>\n',
          'Rules:',
          '- Only save genuine user preferences and profile information',
          '- Be concise: one line per preference',
          '- Don\'t duplicate existing preferences',
          '- Use this for communication preferences, timezone, name, recurring patterns\n'
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

    // Collect prompt sections from pluggable sources
    const sectionContext = {
      messageText,
      sessionId,
      memoryDays: this.config.memoryDays ?? 3
    }

    const sources = [this.toolRegistry, this.skillLoader, this.memory].filter(Boolean)
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

    return { system: parts.join('\n'), activeSkill }
  }
}
