import EventEmitter from 'node:events'

/**
 * Message Bus - Event-driven communication between components
 *
 * Components communicate via events, not direct calls.
 * This decouples channels, agents, providers, and tools.
 *
 * Standard events:
 * - message:in   {text, chatId, userId, channel, timestamp}
 * - message:out  {text, chatId, channel}
 * - thinking:start {chatId, channel}
 * - error        {source, error, context}
 */
class MessageBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(0) // No limit on listeners
  }
}

// Named export: class for testing and multi-instance scenarios
export { MessageBus }

// Default export: singleton for the composition root (index.js)
export default new MessageBus()
