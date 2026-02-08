import logger from '../logger.js'

const RETRYABLE_STATUSES = [429, 500, 502, 503]

/**
 * Required methods that subclasses must implement.
 */
const REQUIRED_METHODS = ['chat']
const REQUIRED_GETTERS = ['name']

/**
 * BaseProvider - Interface for LLM providers
 *
 * All providers must implement this interface.
 * Allows swapping providers (Claude, Gemini, OpenRouter) without changing agent code.
 *
 * Required contract:
 *   - chat(messages, options) → { content, toolCalls, stopReason, rawContent?, usage? }
 *   - get name → string
 *
 * Optional (tool support):
 *   - adaptToolDefinitions(definitions) → adapted definitions
 *   - buildToolResultMessages(rawContent, results) → messages
 *   - get supportsTools → true
 */
export default class BaseProvider {
  constructor() {
    // Validate required interface at construction time (skip for BaseProvider itself)
    if (this.constructor !== BaseProvider) {
      this._validateInterface()
    }
  }

  /**
   * Validate that the subclass implements the required interface.
   * Logs warnings for missing methods — does not throw, to avoid breaking existing code.
   * @private
   */
  _validateInterface() {
    for (const method of REQUIRED_METHODS) {
      if (typeof this[method] !== 'function' || this[method] === BaseProvider.prototype[method]) {
        logger.warn('provider', 'missing_method', {
          provider: this.constructor.name,
          method
        })
      }
    }
    for (const getter of REQUIRED_GETTERS) {
      try {
        // Accessing the getter will throw if it's the base stub
        this[getter]
      } catch {
        logger.warn('provider', 'missing_getter', {
          provider: this.constructor.name,
          getter
        })
      }
    }
  }

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
   * Adapt tool definitions to provider-specific format.
   * Default returns Anthropic format (input_schema). Override for other providers.
   * @param {Array} definitions - Tool definitions in Anthropic format
   * @returns {Array} Adapted tool definitions
   */
  adaptToolDefinitions(definitions) {
    return definitions
  }

  /**
   * Build messages to append after tool execution results.
   * Override in subclass if provider uses a different format.
   * @param {Array} rawContent - Raw assistant response content (for tool_use blocks)
   * @param {Array<{id: string, result: string, isError: boolean}>} results - Tool execution results
   * @returns {Array<{role: string, content: any}>} Messages to append to context
   */
  buildToolResultMessages(rawContent, results) {
    return [
      { role: 'assistant', content: rawContent },
      {
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: r.result,
          is_error: r.isError
        }))
      }
    ]
  }

  /**
   * Whether this provider supports native tool_use.
   * Override to return true in providers that handle tool calls.
   * @returns {boolean}
   */
  get supportsTools() {
    return false
  }

  /**
   * Provider name for logging
   * @returns {string}
   */
  get name() {
    throw new Error('name getter must be implemented by subclass')
  }
}
