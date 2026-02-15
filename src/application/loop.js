import defaultLogger from '../infrastructure/logger.js'
import { MESSAGE_IN, MESSAGE_OUT } from '../infrastructure/events.js'
import { runPostProcessors } from './post-processors.js'
import { withTypingIndicator } from './typing-indicator.js'
import { executeToolCalls } from './tool-executor.js'

/**
 * AgentLoop - Core message handler with session persistence
 *
 * Flow: message:in → build context → provider.chat → [tool loop] → extract memories → save session → message:out
 */
export default class AgentLoop {
  constructor(bus, provider, contextBuilder, storage, memoryManager, { logger = defaultLogger, toolRegistry = null } = {}) {
    this.bus = bus
    this.provider = provider
    this.contextBuilder = contextBuilder
    this.storage = storage
    this.memory = memoryManager || null
    this.logger = logger
    this.toolRegistry = toolRegistry
    this._handler = null
  }

  /**
   * Start the agent loop: register bus listener.
   * Identity is loaded on-demand by CognitiveSystem.
   */
  async start() {
    this._handler = (message) => this._handleMessage(message)
    this.bus.on(MESSAGE_IN, this._handler)

    this.logger.info('agent', 'started', { provider: this.provider.name })
  }

  /**
   * Stop the agent loop: remove bus listener.
   */
  stop() {
    if (this._handler) {
      this.bus.off(MESSAGE_IN, this._handler)
      this._handler = null
    }
    this.logger.info('agent', 'stopped')
  }

  /**
   * Handle an incoming message.
   * @private
   */
  async _handleMessage(message) {
    const sessionId = `${message.channel}-${message.chatId}`

    this.logger.info('agent', 'message_received', {
      sessionId,
      userId: message.userId,
      length: message.text.length
    })

    const typingPayload = { chatId: message.chatId, channel: message.channel }

    try {
      await withTypingIndicator(this.bus, typingPayload, async () => {
        const start = Date.now()

        // Load history (needed for bootstrap profile inference)
        const historyLimit = this.contextBuilder.config?.sessionHistoryLimit ?? 20
        const history = await this.storage.loadSession(sessionId, historyLimit)

        // Process bootstrap if active (before building context)
        let bootstrapAction = null
        if (this.contextBuilder.cognitive) {
          bootstrapAction = await this.contextBuilder.cognitive.processBootstrapIfActive(
            sessionId, message.text, history
          )
        }

        // Build context with identity + history + bootstrap action
        const context = await this.contextBuilder.build(sessionId, message, { bootstrapAction, history })

        // Build chat options (add tools if provider supports them)
        const chatOptions = { system: context.system }
        if (this.toolRegistry && this.provider.supportsTools) {
          chatOptions.tools = this.provider.adaptToolDefinitions(this.toolRegistry.getDefinitions())
        }

        // Call provider (may return tool_use requiring iteration)
        let messages = [...context.messages]
        let response = await this.provider.chatWithRetry(messages, chatOptions)

        // ReAct loop: execute tools and iterate until final response
        const maxIterations = this.contextBuilder.config?.maxToolIterations ?? 5
        let iterations = 0

        while (response.stopReason === 'tool_use' && response.toolCalls?.length && iterations < maxIterations) {
          iterations++

          this.logger.info('agent', 'tool_iteration', {
            sessionId,
            iteration: iterations,
            tools: response.toolCalls.map(t => t.name)
          })

          const results = await executeToolCalls(response.toolCalls, this.toolRegistry, { logger: this.logger })
          const toolMessages = this.provider.buildToolResultMessages(response.rawContent, results)
          messages = [...messages, ...toolMessages]
          response = await this.provider.chatWithRetry(messages, chatOptions)
        }

        if (iterations >= maxIterations && response.stopReason === 'tool_use') {
          this.logger.warn('agent', 'tool_max_iterations', { sessionId, maxIterations })
        }

        const durationMs = Date.now() - start

        // Run post-processor pipeline: extract tags, persist, clean text
        const { cleanText, stats } = await runPostProcessors(response.content, {
          memory: this.memory,
          cognitive: this.contextBuilder.cognitive,
          bus: this.bus,
          sessionId,
          logger: this.logger
        })

        this.logger.info('agent', 'response_generated', {
          sessionId,
          durationMs,
          contentLength: cleanText.length,
          toolIterations: iterations || undefined,
          memoriesExtracted: stats.memory?.memories?.length || 0,
          chatMemoriesExtracted: stats['chat-memory']?.chatMemories?.length || 0,
          userUpdates: stats.user?.updates?.length || 0,
          bootstrapComplete: stats.bootstrap?.isComplete || undefined
        })

        // Save both messages to session history (clean text without tags)
        const now = Date.now()
        await this.storage.saveSession(sessionId, [
          { role: 'user', content: message.text, timestamp: now - 1 },
          { role: 'assistant', content: cleanText, timestamp: now }
        ])

        // Fire response signal (clean text without memory tags)
        this.bus.fire(MESSAGE_OUT, {
          chatId: message.chatId,
          text: cleanText,
          channel: message.channel
        }, { source: 'agent' })
      })
    } catch (error) {
      this.logger.error('agent', 'message_failed', {
        sessionId,
        error: error.message
      })

      this.bus.fire(MESSAGE_OUT, {
        chatId: message.chatId,
        text: `Error: ${error.message}`,
        channel: message.channel
      }, { source: 'agent' })
    }
  }
}
