import logger from '../logger.js'

/**
 * AgentLoop - Core message handler with session persistence
 *
 * Replaces the inline handler in index.js with proper context building,
 * session routing, and history persistence.
 *
 * Flow: message:in → build context → provider.chat → save session → message:out
 */
export default class AgentLoop {
  constructor(bus, provider, contextBuilder, storage) {
    this.bus = bus
    this.provider = provider
    this.contextBuilder = contextBuilder
    this.storage = storage
    this._handler = null
  }

  /**
   * Start the agent loop: load identity and register bus listener.
   */
  async start() {
    await this.contextBuilder.loadIdentity()

    this._handler = (message) => this._handleMessage(message)
    this.bus.on('message:in', this._handler)

    logger.info('agent', 'started', { provider: this.provider.name })
  }

  /**
   * Stop the agent loop: remove bus listener.
   */
  stop() {
    if (this._handler) {
      this.bus.off('message:in', this._handler)
      this._handler = null
    }
    logger.info('agent', 'stopped')
  }

  /**
   * Handle an incoming message.
   * @private
   */
  async _handleMessage(message) {
    const sessionId = `${message.channel}-${message.chatId}`

    logger.info('agent', 'message_received', {
      sessionId,
      userId: message.userId,
      length: message.text.length
    })

    // Typing indicator
    const typingPayload = { chatId: message.chatId, channel: message.channel }
    this.bus.emit('thinking:start', typingPayload)
    const typingInterval = setInterval(() => this.bus.emit('thinking:start', typingPayload), 4000)

    try {
      const start = Date.now()

      // Build context with identity + history
      const context = await this.contextBuilder.build(sessionId, message)

      // Call provider
      const response = await this.provider.chat(context.messages, { system: context.system })

      clearInterval(typingInterval)

      const durationMs = Date.now() - start
      logger.info('agent', 'response_generated', {
        sessionId,
        durationMs,
        contentLength: response.content.length
      })

      // Save both messages to session history
      const now = Date.now()
      await this.storage.saveSession(sessionId, [
        { role: 'user', content: message.text, timestamp: now - 1 },
        { role: 'assistant', content: response.content, timestamp: now }
      ])

      // Emit response
      this.bus.emit('message:out', {
        chatId: message.chatId,
        text: response.content,
        channel: message.channel
      })
    } catch (error) {
      clearInterval(typingInterval)

      logger.error('agent', 'message_failed', {
        sessionId,
        error: error.message
      })

      this.bus.emit('message:out', {
        chatId: message.chatId,
        text: `Error: ${error.message}`,
        channel: message.channel
      })
    }
  }
}
