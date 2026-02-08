import logger from '../logger.js'
import { MESSAGE_IN, MESSAGE_OUT, THINKING_START } from '../events.js'
import { runPostProcessors } from './post-processors.js'

/**
 * AgentLoop - Core message handler with session persistence
 *
 * Replaces the inline handler in index.js with proper context building,
 * session routing, and history persistence.
 *
 * Flow: message:in → build context → provider.chat → [tool loop] → extract memories → extract user prefs → save session → message:out
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
    this.bus.on(MESSAGE_IN, this._handler)

    logger.info('agent', 'started', { provider: this.provider.name })
  }

  /**
   * Stop the agent loop: remove bus listener.
   */
  stop() {
    if (this._handler) {
      this.bus.off(MESSAGE_IN, this._handler)
      this._handler = null
    }
    logger.info('agent', 'stopped')
  }

  /**
   * Check if message matches a tool trigger and execute it.
   * @private
   * @returns {{ toolName: string, result: string, enrichedPrompt: string }|null}
   */
  async _executeTrigger(sessionId, text, messageContext) {
    if (!this.toolRegistry) return null

    const match = this.toolRegistry.matchTrigger(text)
    if (!match) return null

    const { tool, input } = match
    const toolName = tool.definition.name

    logger.info('agent', 'trigger_matched', { sessionId, tool: toolName, input })

    try {
      const result = await tool.execute(input, messageContext)
      return {
        toolName,
        result,
        enrichedPrompt: `${text}\n\n[${toolName} result]\n${result}`
      }
    } catch (error) {
      logger.error('agent', 'trigger_failed', { sessionId, tool: toolName, error: error.message })
      return {
        toolName,
        result: error.message,
        enrichedPrompt: `${text}\n\n[${toolName} error]\n${error.message}`
      }
    }
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
    this.bus.emit(THINKING_START, typingPayload)
    const typingInterval = setInterval(() => this.bus.emit(THINKING_START, typingPayload), 4000)

    try {
      const start = Date.now()

      // Message context for tools that need chatId/userId (e.g. schedule)
      const messageContext = { chatId: message.chatId, userId: message.userId, channel: message.channel }

      // Check for slash command triggers (e.g. /fetch, /n8n, /schedule)
      const triggerResult = await this._executeTrigger(sessionId, message.text, messageContext)

      // Build context with identity + history
      const context = await this.contextBuilder.build(sessionId, message)
      const { activeSkill } = context

      if (activeSkill) {
        logger.info('agent', 'skill_activated', { sessionId, skill: activeSkill })
      }

      // Dev mode: detect devMode signal from /dev tool
      let devMode = null
      if (triggerResult) {
        try {
          const parsed = JSON.parse(triggerResult.result)
          if (parsed.devMode) {
            devMode = parsed
            logger.info('agent', 'dev_mode', { sessionId, project: parsed.project, cwd: parsed.cwd })
          }
        } catch { /* not JSON — normal tool result */ }
      }

      // If trigger matched, enrich the last user message with tool result
      // (skip enrichment for devMode — we replace the message with just the task)
      if (triggerResult && !devMode) {
        const lastMsg = context.messages[context.messages.length - 1]
        lastMsg.content = triggerResult.enrichedPrompt
      }

      // Build chat options with tool definitions
      const chatOptions = { system: context.system }

      // Dev mode: set CWD for provider and replace message with task
      if (devMode) {
        chatOptions.cwd = devMode.cwd
        const lastMsg = context.messages[context.messages.length - 1]
        lastMsg.content = devMode.task
      }
      const rawToolDefs = this.toolRegistry?.getDefinitions() || []
      if (rawToolDefs.length > 0) {
        chatOptions.tools = this.provider.adaptToolDefinitions(rawToolDefs)
      }

      // Call provider
      let response = await this.provider.chatWithRetry(context.messages, chatOptions)

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
              const result = await this.toolRegistry.execute(tc.name, tc.input, messageContext)
              return { id: tc.id, result: String(result), isError: false }
            } catch (error) {
              return { id: tc.id, result: `Error: ${error.message}`, isError: true }
            }
          })
        )

        // Build tool result messages in provider-specific format
        const toolMessages = this.provider.buildToolResultMessages(response.rawContent, results)
        context.messages.push(...toolMessages)

        response = await this.provider.chatWithRetry(context.messages, chatOptions)
      }

      // Safety valve: if still requesting tools after max iterations
      if (response.toolCalls) {
        const pendingTools = response.toolCalls.map(tc => tc.name)
        logger.warn('agent', 'max_iterations_exceeded', { sessionId, iterations, pendingTools })
        response.content = "I'm having trouble completing this task. Let me try a different approach."
      }

      clearInterval(typingInterval)

      const durationMs = Date.now() - start

      // Run post-processor pipeline: extract tags, persist, clean text
      const { cleanText, stats } = await runPostProcessors(response.content, {
        memory: this.memory,
        identityLoader: this.contextBuilder.identityLoader,
        bus: this.bus,
        sessionId
      })

      logger.info('agent', 'response_generated', {
        sessionId,
        durationMs,
        contentLength: cleanText.length,
        memoriesExtracted: stats.memory?.memories?.length || 0,
        chatMemoriesExtracted: stats['chat-memory']?.chatMemories?.length || 0,
        userUpdates: stats.user?.updates?.length || 0,
        toolIterations: iterations,
        activeSkill: activeSkill || null,
        bootstrapComplete: stats.bootstrap?.isComplete || undefined
      })

      // Save both messages to session history (clean text without tags)
      const now = Date.now()
      await this.storage.saveSession(sessionId, [
        { role: 'user', content: message.text, timestamp: now - 1 },
        { role: 'assistant', content: cleanText, timestamp: now }
      ])

      // Emit response (clean text without memory tags)
      this.bus.emit(MESSAGE_OUT, {
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

      this.bus.emit(MESSAGE_OUT, {
        chatId: message.chatId,
        text: `Error: ${error.message}`,
        channel: message.channel
      })
    }
  }
}
