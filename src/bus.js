import EventEmitter from 'node:events'

/**
 * Message Bus - Event-driven communication between components
 *
 * Components communicate via events, not direct calls.
 * This decouples channels, agents, providers, and tools.
 *
 * Standard events:
 * - message:in  {text, chatId, userId, channel, timestamp}
 * - message:out {text, chatId, channel}
 * - error       {source, error, context}
 */
class MessageBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(0) // No limit on listeners
  }
}

// Export singleton instance
export default new MessageBus()
