import EventEmitter from 'node:events'
import logger from '../logger.js'

/**
 * BaseChannel - Interface for I/O channels (Telegram, Discord, HTTP, etc.)
 *
 * Template Method pattern: common logic in base class, specifics in subclasses.
 * Each channel only needs to implement start(), stop(), send().
 * Permission checking and bus wiring are inherited.
 */
export default class BaseChannel extends EventEmitter {
  constructor(bus, config) {
    super()
    this.bus = bus
    this.config = config
  }

  /**
   * Start listening for messages
   * Subclass must implement
   */
  async start() {
    throw new Error('start() must be implemented by subclass')
  }

  /**
   * Stop listening, cleanup resources
   * Subclass must implement
   */
  async stop() {
    throw new Error('stop() must be implemented by subclass')
  }

  /**
   * Send a message to a user/chat
   * Subclass must implement
   * @param {string} chatId - Target chat/user ID
   * @param {string} text - Message content
   * @param {Object} options - Formatting, attachments, etc.
   */
  async send(chatId, text, options = {}) {
    throw new Error('send() must be implemented by subclass')
  }

  /**
   * Channel name for logging
   * Subclass must implement
   * @returns {string}
   */
  get name() {
    throw new Error('name getter must be implemented by subclass')
  }

  /**
   * Publish incoming message to bus (Template Method)
   * Common logic: permission check + bus publish
   * @param {Object} message - {text, chatId, userId, timestamp, metadata}
   * @protected
   */
  _publishMessage(message) {
    // Security: deny by default
    if (!this._isAllowed(message.userId)) {
      logger.warn('channel', 'auth_rejected', { userId: message.userId, channel: this.name })
      return
    }

    // Publish to bus with channel info
    this.bus.emit('message:in', {
      ...message,
      channel: this.name
    })
  }

  /**
   * Check if user is authorized (Template Method)
   * @param {string} userId
   * @returns {boolean}
   * @protected
   */
  /**
   * Send a message with consistent error handling.
   * Logs failures and emits bus error events.
   * @param {string} chatId
   * @param {string} text
   * @param {Object} options
   * @protected
   */
  async _safeSend(chatId, text, options = {}) {
    try {
      await this.send(chatId, text, options)
    } catch (error) {
      logger.error('channel', 'send_failed', { channel: this.name, chatId, error: error.message })
      this.bus.emit('error', { source: this.name, error })
    }
  }

  _isAllowed(userId) {
    const allowFrom = this.config.allowFrom || []

    // Deny by default (security)
    if (allowFrom.length === 0) {
      logger.error('channel', 'no_allowlist', { channel: this.name })
      return false
    }

    return allowFrom.includes(userId)
  }
}
