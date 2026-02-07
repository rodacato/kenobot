import logger from '../logger.js'

const RETRYABLE_STATUSES = [429, 500, 502, 503]

/**
 * BaseProvider - Interface for LLM providers
 *
 * All providers must implement this interface.
 * Allows swapping providers (Claude, Gemini, OpenRouter) without changing agent code.
 */
export default class BaseProvider {
  /**
   * Send messages to LLM and get response
   * @param {Array<{role: string, content: string|Array}>} messages - Conversation history
   * @param {Object} options - Provider-specific options (model, temperature, tools, etc.)
   * @returns {Promise<{content: string, toolCalls: Array|null, stopReason: string, rawContent: Array|null, usage?: Object}>}
   */
  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented by subclass')
  }

  /**
   * Wrapper around chat() with exponential backoff retry for transient errors.
   * Retries on HTTP 429, 500, 502, 503. Max 3 attempts with 1s, 2s, 4s delays.
   * Non-retryable errors are thrown immediately.
   */
  async chatWithRetry(messages, options = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.chat(messages, options)
      } catch (error) {
        const isRetryable = RETRYABLE_STATUSES.includes(error.status)
        const isLastAttempt = attempt === maxRetries

        if (!isRetryable || isLastAttempt) throw error

        const delayMs = this._retryDelay(attempt)
        logger.warn('provider', 'retrying', {
          provider: this.name,
          attempt,
          maxRetries,
          status: error.status,
          delayMs,
          error: error.message
        })
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  /**
   * Calculate retry delay in ms for a given attempt number.
   * Overridable for testing.
   */
  _retryDelay(attempt) {
    return Math.pow(2, attempt - 1) * 1000
  }

  /**
   * Provider name for logging
   * @returns {string}
   */
  get name() {
    throw new Error('name getter must be implemented by subclass')
  }
}
