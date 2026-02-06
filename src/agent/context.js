import logger from '../logger.js'

/**
 * ContextBuilder - Assembles system prompt and message history for providers
 *
 * Returns provider-agnostic { system, messages } format.
 * Each provider adapts this to its own API:
 *   - claude-api: native system param + messages array
 *   - claude-cli: prepends system to prompt string
 *   - mock: ignores system, pattern-matches last message
 */
export default class ContextBuilder {
  constructor(config, storage) {
    this.config = config
    this.storage = storage
    this._identity = null
  }

  /**
   * Load identity from file and cache it.
   * Called once at startup by AgentLoop.
   */
  async loadIdentity() {
    const identityFile = this.config.identityFile || 'IDENTITY.md'
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

    // Load session history (last 20 messages)
    const history = await this.storage.loadSession(sessionId)

    // Map history to provider format (strip timestamps)
    const messages = history.map(({ role, content }) => ({ role, content }))

    // Append current user message
    messages.push({ role: 'user', content: message.text })

    return {
      system: this._identity,
      messages
    }
  }
}
