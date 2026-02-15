import EventEmitter from 'node:events'
import { MESSAGE_IN, ERROR } from '../../infrastructure/events.js'
import defaultLogger from '../../infrastructure/logger.js'

const DEFAULT_RATE_LIMIT = { maxPerMinute: 0, maxPerHour: 0 }

/**
 * BaseChannel - Interface for I/O channels (Telegram, Discord, HTTP, etc.)
 *
 * Template Method pattern: common logic in base class, specifics in subclasses.
 * Each channel only needs to implement start(), stop(), send().
 * Permission checking, rate limiting, and bus wiring are inherited.
 */
export default class BaseChannel extends EventEmitter {
  constructor(bus, config) {
    super()
    this.bus = bus
    this.config = config
    this.logger = config.logger || defaultLogger

    // Rate limiting: per-user sliding window (disabled when limits are 0)
    this._rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT
    this._rateBuckets = new Map() // userId → { timestamps: number[] }
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
    if (!this._isAllowed(message.userId, message.chatId)) {
      this.logger.warn('channel', 'auth_rejected', { userId: message.userId, chatId: message.chatId, channel: this.name })
      return
    }

    // Rate limiting (if configured)
    if (this._isRateLimited(message.userId)) {
      this.logger.warn('channel', 'rate_limited', { userId: message.userId, channel: this.name })
      return
    }

    // Publish to bus with channel info
    this.bus.fire(MESSAGE_IN, {
      ...message,
      channel: this.name
    }, { source: this.name })
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
      this.logger.error('channel', 'send_failed', { channel: this.name, chatId, error: error.message })
      this.bus.fire(ERROR, { source: this.name, error }, { source: this.name })
    }
  }

  /**
   * Check if a user has exceeded rate limits.
   * Uses a sliding window per user. Returns false (not limited) when limits are 0.
   * @param {string} userId
   * @returns {boolean}
   * @protected
   */
  _isRateLimited(userId) {
    const { maxPerMinute, maxPerHour } = this._rateLimit
    if (!maxPerMinute && !maxPerHour) return false

    const now = Date.now()
    const bucket = this._rateBuckets.get(userId) || { timestamps: [] }

    // Prune timestamps older than 1 hour
    bucket.timestamps = bucket.timestamps.filter(t => now - t < 3600000)

    if (maxPerMinute) {
      const recentMinute = bucket.timestamps.filter(t => now - t < 60000).length
      if (recentMinute >= maxPerMinute) return true
    }

    if (maxPerHour) {
      if (bucket.timestamps.length >= maxPerHour) return true
    }

    // Record this request
    bucket.timestamps.push(now)
    this._rateBuckets.set(userId, bucket)
    return false
  }

  _isAllowed(userId, chatId) {
    const { allowFrom, allowedUsers = [], allowedChatIds = [] } = this.config

    // Backwards compat: old config passes allowFrom
    if (allowFrom) return allowFrom.includes(userId)

    // Deny by default (security)
    if (allowedUsers.length === 0 && allowedChatIds.length === 0) {
      this.logger.error('channel', 'no_allowlist', { channel: this.name })
      return false
    }

    // User-based: this specific user is allowed anywhere
    if (allowedUsers.includes(userId)) return true

    // Chat-based: anyone in this specific chat is allowed
    if (chatId && allowedChatIds.includes(chatId)) return true

    return false
  }
}
