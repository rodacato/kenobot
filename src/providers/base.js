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
   * Provider name for logging
   * @returns {string}
   */
  get name() {
    throw new Error('name getter must be implemented by subclass')
  }
}
