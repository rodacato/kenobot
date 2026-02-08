import defaultLogger from '../logger.js'
import { MESSAGE_IN, MESSAGE_OUT } from '../events.js'
import { runPostProcessors } from './post-processors.js'
import ToolOrchestrator from './tool-orchestrator.js'
import { withTypingIndicator } from './typing-indicator.js'

/**
 * AgentLoop - Core message handler with session persistence
 *
 * Replaces the inline handler in index.js with proper context building,
 * session routing, and history persistence.
 *
 * Flow: message:in → build context → provider.chat → [tool loop] → extract memories → extract user prefs → save session → message:out
 */
export default class AgentLoop {
  constructor(bus, provider, contextBuilder, storage, memoryManager, toolRegistry, { logger = defaultLogger } = {}) {
    this.bus = bus
    this.provider = provider
    this.contextBuilder = contextBuilder
    this.storage = storage
    this.memory = memoryManager || null
    this.toolRegistry = toolRegistry || null
    this.logger = logger
    this._toolOrchestrator = toolRegistry
      ? new ToolOrchestrator(toolRegistry, provider, { logger })
      : null
    this._handler = null

    if (toolRegistry && !provider.supportsTools) {
      this.logger.warn('agent', 'tools_without_support', {
        provider: provider.name,
        hint: 'Provider does not support native tool_use — tool calls will not work'
      })
    }
  }

  get maxToolIterations() {
    return this._toolOrchestrator?.maxIterations ?? 20
  }

  set maxToolIterations(value) {
    if (this._toolOrchestrator) this._toolOrchestrator.maxIterations = value
  }

  /**
   * Start the agent loop: load identity and register bus listener.
   */
  async start() {
    await this.contextBuilder.loadIdentity()

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

    this.logger.info('agent', 'trigger_matched', { sessionId, tool: toolName, input })

    try {
      const result = await tool.execute(input, messageContext)
      return {
        toolName,
        result,
        enrichedPrompt: `${text}\n\n[${toolName} result]\n${result}`
      }
    } catch (error) {
      this.logger.error('agent', 'trigger_failed', { sessionId, tool: toolName, error: error.message })
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

    this.logger.info('agent', 'message_received', {
      sessionId,
      userId: message.userId,
      length: message.text.length
    })

    const typingPayload = { chatId: message.chatId, channel: message.channel }

    try {
      await withTypingIndicator(this.bus, typingPayload, async () => {
        const start = Date.now()

        // Message context for tools that need chatId/userId (e.g. schedule)
        const messageContext = { chatId: message.chatId, userId: message.userId, channel: message.channel }

        // Check for slash command triggers (e.g. /fetch, /n8n, /schedule)
        const triggerResult = await this._executeTrigger(sessionId, message.text, messageContext)

        // Build context with identity + history
        const context = await this.contextBuilder.build(sessionId, message)
        const { activeSkill } = context

        if (activeSkill) {
          this.logger.info('agent', 'skill_activated', { sessionId, skill: activeSkill })
        }

        // Dev mode: detect devMode signal from /dev tool
        let devMode = null
        if (triggerResult) {
          try {
            const parsed = JSON.parse(triggerResult.result)
            if (parsed.devMode) {
              devMode = parsed
              this.logger.info('agent', 'dev_mode', { sessionId, project: parsed.project, cwd: parsed.cwd })
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

        // Tool execution loop (delegated to ToolOrchestrator)
        let iterations = 0
        if (response.toolCalls && this._toolOrchestrator) {
          const result = await this._toolOrchestrator.executeLoop(
            response, context.messages, chatOptions, messageContext, sessionId
          )
          response = result.response
          iterations = result.iterations
        } else if (response.toolCalls) {
          // No tool registry — fallback message
          response = { ...response, content: "I'm having trouble completing this task. Let me try a different approach." }
        }

        const durationMs = Date.now() - start

        // Run post-processor pipeline: extract tags, persist, clean text
        const { cleanText, stats } = await runPostProcessors(response.content, {
          memory: this.memory,
          identityLoader: this.contextBuilder.identityLoader,
          bus: this.bus,
          sessionId,
          logger: this.logger
        })

        this.logger.info('agent', 'response_generated', {
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
      })
    } catch (error) {
      this.logger.error('agent', 'message_failed', {
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
