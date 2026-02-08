import logger from '../logger.js'

const FALLBACK_MESSAGE = "I'm having trouble completing this task. Let me try a different approach."

/**
 * ToolOrchestrator - Manages the tool execution loop
 *
 * Extracted from AgentLoop to separate concerns:
 * - AgentLoop: message orchestration, context, session persistence, post-processing
 * - ToolOrchestrator: tool execution cycle, iteration limits, parallel execution
 */
export default class ToolOrchestrator {
  constructor(toolRegistry, provider, { maxIterations = 20 } = {}) {
    this.toolRegistry = toolRegistry
    this.provider = provider
    this.maxIterations = maxIterations
  }

  /**
   * Run the tool execution loop until the provider stops requesting tools
   * or the iteration limit is reached.
   *
   * @param {Object} response - Initial provider response (may contain toolCalls)
   * @param {Array} messages - Conversation messages array (mutated with tool results)
   * @param {Object} chatOptions - Options passed to provider.chatWithRetry
   * @param {Object} messageContext - { chatId, userId, channel } for tool execution
   * @param {string} sessionId - For logging
   * @returns {{ response: Object, iterations: number }}
   */
  async executeLoop(response, messages, chatOptions, messageContext, sessionId) {
    let iterations = 0

    while (response.toolCalls && iterations < this.maxIterations) {
      iterations++
      logger.info('agent', 'tool_calls', {
        sessionId,
        iteration: iterations,
        tools: response.toolCalls.map(tc => tc.name)
      })

      // Execute all tool calls in parallel
      const results = await Promise.all(
        response.toolCalls.map(async (tc) => {
          try {
            const result = await this.toolRegistry.execute(tc.name, tc.input, messageContext)
            return { id: tc.id, result: String(result), isError: false }
          } catch (error) {
            return { id: tc.id, result: `Error: ${error.message}`, isError: true }
          }
        })
      )

      // Build tool result messages in provider-specific format
      const toolMessages = this.provider.buildToolResultMessages(response.rawContent, results)
      messages.push(...toolMessages)

      response = await this.provider.chatWithRetry(messages, chatOptions)
    }

    // Safety valve: if still requesting tools after max iterations
    if (response.toolCalls) {
      const pendingTools = response.toolCalls.map(tc => tc.name)
      logger.warn('agent', 'max_iterations_exceeded', { sessionId, iterations, pendingTools })
      response = { ...response, content: FALLBACK_MESSAGE }
    }

    return { response, iterations }
  }
}
