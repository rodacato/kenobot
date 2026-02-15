import defaultLogger from '../../../infrastructure/logger.js'

/**
 * MessageBatcher - Batches rapid messages to reduce API calls
 *
 * Strategies:
 * 1. Adaptive debouncing (wait N seconds of silence)
 * 2. Detect incomplete messages ("...", "wait", etc.)
 * 3. Configurable timeouts per channel
 *
 * Phase 6: Basic debouncing implementation
 * Future: ML-based incompleteness detection
 */
export default class MessageBatcher {
  constructor({ logger = defaultLogger, defaultDebounceMs = 2000, maxWaitMs = 10000 } = {}) {
    this.logger = logger
    this.defaultDebounceMs = defaultDebounceMs
    this.maxWaitMs = maxWaitMs

    // Track batches per session
    this.batches = new Map() // sessionId -> { messages, timer, firstMessageTime }
  }

  /**
   * Add message to batch for a session.
   * Returns a promise that resolves when batch is ready to send.
   *
   * @param {string} sessionId - Session identifier
   * @param {string} message - Message text
   * @param {Object} options - Batching options
   * @returns {Promise<Array<string>>} Batched messages when ready
   */
  async add(sessionId, message, { debounceMs = this.defaultDebounceMs } = {}) {
    return new Promise((resolve) => {
      let batch = this.batches.get(sessionId)

      if (!batch) {
        // Create new batch
        batch = {
          messages: [],
          resolve: null,
          timer: null,
          firstMessageTime: Date.now()
        }
        this.batches.set(sessionId, batch)
      }

      // Add message to batch
      batch.messages.push(message)

      // Clear existing timer
      if (batch.timer) {
        clearTimeout(batch.timer)
      }

      // Check if we should flush immediately
      const shouldFlushImmediately = this.shouldFlushImmediately(message)
      const timeElapsed = Date.now() - batch.firstMessageTime
      const maxWaitExceeded = timeElapsed >= this.maxWaitMs

      if (shouldFlushImmediately || maxWaitExceeded) {
        this.logger.info('message-batcher', 'flush_immediate', {
          sessionId,
          reason: shouldFlushImmediately ? 'complete_message' : 'max_wait',
          messageCount: batch.messages.length,
          timeElapsed
        })

        const messages = this.flush(sessionId)
        resolve(messages)
        return
      }

      // Set new debounce timer
      batch.timer = setTimeout(() => {
        this.logger.info('message-batcher', 'flush_debounce', {
          sessionId,
          messageCount: batch.messages.length,
          debounceMs
        })

        const messages = this.flush(sessionId)
        if (batch.resolve) {
          batch.resolve(messages)
        }
        resolve(messages)
      }, debounceMs)

      // Store resolve for this batch
      batch.resolve = resolve
    })
  }

  /**
   * Check if message appears complete (should flush immediately).
   *
   * Incomplete indicators:
   * - Ends with "..."
   * - Contains "wait" or "hold on"
   * - Very short (<5 chars)
   *
   * @param {string} message - Message to check
   * @returns {boolean}
   */
  shouldFlushImmediately(message) {
    const trimmed = message.trim().toLowerCase()

    // Very short messages might be incomplete
    if (trimmed.length < 5) {
      return false
    }

    // Incomplete indicators
    if (trimmed.endsWith('...')) return false
    if (trimmed.endsWith('..')) return false
    if (trimmed.includes('wait')) return false
    if (trimmed.includes('hold on')) return false
    if (trimmed.includes('espera')) return false
    if (trimmed.includes('momento')) return false

    // Message appears complete
    return true
  }

  /**
   * Flush batch for a session (return and clear).
   *
   * @param {string} sessionId - Session identifier
   * @returns {Array<string>} Batched messages
   */
  flush(sessionId) {
    const batch = this.batches.get(sessionId)

    if (!batch) {
      return []
    }

    // Clear timer
    if (batch.timer) {
      clearTimeout(batch.timer)
    }

    // Get messages and clear batch
    const messages = [...batch.messages]
    this.batches.delete(sessionId)

    return messages
  }

  /**
   * Get current batch size for a session.
   *
   * @param {string} sessionId - Session identifier
   * @returns {number} Number of messages in batch
   */
  getBatchSize(sessionId) {
    const batch = this.batches.get(sessionId)
    return batch ? batch.messages.length : 0
  }

  /**
   * Check if session has pending batch.
   *
   * @param {string} sessionId - Session identifier
   * @returns {boolean}
   */
  hasPendingBatch(sessionId) {
    return this.batches.has(sessionId)
  }

  /**
   * Clear all batches (for cleanup).
   */
  clearAll() {
    for (const [sessionId, batch] of this.batches.entries()) {
      if (batch.timer) {
        clearTimeout(batch.timer)
      }
    }

    this.batches.clear()
    this.logger.info('message-batcher', 'cleared_all', {})
  }
}
