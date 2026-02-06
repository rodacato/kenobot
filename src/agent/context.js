import logger from '../logger.js'

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
 *   [IDENTITY.md] + [Memory instructions + MEMORY.md + recent daily logs]
 */
export default class ContextBuilder {
  constructor(config, storage, memoryManager) {
    this.config = config
    this.storage = storage
    this.memory = memoryManager || null
    this._identity = null
  }

  /**
   * Load identity from file and cache it.
   * Called once at startup by AgentLoop.
   */
  async loadIdentity() {
    const identityFile = this.config.identityFile || 'identities/kenobot.md'
    this._identity = await this.storage.readFile(identityFile)
    logger.info('context', 'identity_loaded', { file: identityFile, length: this._identity.length })
  }

  /**
   * Build context for a provider call.
   * @param {string} sessionId - e.g. "telegram-123456789"
   * @param {Object} message - Incoming message { text, chatId, userId, ... }
   * @returns {{ system: string, messages: Array<{role: string, content: string}> }}
   */
  async build(sessionId, message) {
    // Ensure identity is loaded
    if (!this._identity) {
      await this.loadIdentity()
    }

    // Build system prompt: identity + memory
    const system = await this._buildSystemPrompt()

    // Load session history (last 20 messages)
    const history = await this.storage.loadSession(sessionId)

    // Map history to provider format (strip timestamps)
    const messages = history.map(({ role, content }) => ({ role, content }))

    // Append current user message
    messages.push({ role: 'user', content: message.text })

    return { system, messages }
  }

  /**
   * Assemble system prompt from identity + memory context.
   * @private
   */
  async _buildSystemPrompt() {
    const parts = [this._identity]

    if (this.memory) {
      const memoryDays = this.config.memoryDays ?? 3
      const [longTerm, recentNotes] = await Promise.all([
        this.memory.getLongTermMemory(),
        this.memory.getRecentDays(memoryDays)
      ])

      const memorySection = [
        '\n---\n',
        '## Memory\n',
        'You have persistent memory across conversations. Use it wisely.\n',
        '### How to remember things',
        'When you learn something worth remembering (user preferences, important facts, project context, decisions made), include it in your response:\n',
        '<memory>Short title: fact to remember</memory>\n',
        'Rules:',
        '- Only save things that matter across conversations',
        '- Be concise: one line per memory',
        '- Don\'t save things already in your long-term memory',
        '- You can include multiple <memory> tags in one response\n'
      ]

      if (longTerm) {
        memorySection.push('### Long-term memory')
        memorySection.push(longTerm + '\n')
      }

      if (recentNotes) {
        memorySection.push('### Recent notes')
        memorySection.push(recentNotes)
      }

      parts.push(memorySection.join('\n'))
    }

    return parts.join('\n')
  }
}
