import logger from '../logger.js'
import { extractMemories } from './memory-extractor.js'

/**
 * AgentLoop - Core message handler with session persistence
 *
 * Replaces the inline handler in index.js with proper context building,
 * session routing, and history persistence.
 *
 * Flow: message:in → build context → provider.chat → [tool loop] → extract memories → save session → message:out
 */
export default class AgentLoop {
  constructor(bus, provider, contextBuilder, storage, memoryManager, toolRegistry) {
    this.bus = bus
    this.provider = provider
    this.contextBuilder = contextBuilder
    this.storage = storage
    this.memory = memoryManager || null
    this.toolRegistry = toolRegistry || null
    this.maxToolIterations = 20
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

      // Build chat options with tool definitions
      const chatOptions = { system: context.system }
      const toolDefs = this.toolRegistry?.getDefinitions() || []
      if (toolDefs.length > 0) chatOptions.tools = toolDefs

      // Call provider
      let response = await this.provider.chat(context.messages, chatOptions)

      // Tool execution loop (max iterations as safety valve)
      let iterations = 0
      while (response.toolCalls && this.toolRegistry && iterations < this.maxToolIterations) {
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
              const result = await this.toolRegistry.execute(tc.name, tc.input)
              return { id: tc.id, result: String(result), isError: false }
            } catch (error) {
              return { id: tc.id, result: `Error: ${error.message}`, isError: true }
            }
          })
        )

        // Build tool result messages for next provider call
        context.messages.push({ role: 'assistant', content: response.rawContent })
        context.messages.push({
          role: 'user',
          content: results.map(r => ({
            type: 'tool_result',
            tool_use_id: r.id,
            content: r.result,
            is_error: r.isError
          }))
        })

        response = await this.provider.chat(context.messages, chatOptions)
      }

      // Safety valve: if still requesting tools after max iterations
      if (response.toolCalls) {
        response.content = "I'm having trouble completing this task. Let me try a different approach."
      }

      clearInterval(typingInterval)

      const durationMs = Date.now() - start

      // Extract memory tags from response
      const { cleanText, memories } = extractMemories(response.content)

      logger.info('agent', 'response_generated', {
        sessionId,
        durationMs,
        contentLength: cleanText.length,
        memoriesExtracted: memories.length,
        toolIterations: iterations
      })

      // Save memories to daily log
      if (this.memory && memories.length > 0) {
        for (const entry of memories) {
          await this.memory.appendDaily(entry)
        }
      }

      // Save both messages to session history (clean text without memory tags)
      const now = Date.now()
      await this.storage.saveSession(sessionId, [
        { role: 'user', content: message.text, timestamp: now - 1 },
        { role: 'assistant', content: cleanText, timestamp: now }
      ])

      // Emit response (clean text without memory tags)
      this.bus.emit('message:out', {
        chatId: message.chatId,
        text: cleanText,
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
