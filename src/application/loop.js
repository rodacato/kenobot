import defaultLogger from '../infrastructure/logger.js'
import { MESSAGE_IN, MESSAGE_OUT, TASK_QUEUED, TASK_CANCELLED } from '../infrastructure/events.js'
import { runPostProcessors } from './post-processors.js'
import { withTypingIndicator } from './typing-indicator.js'
import { executeToolCalls } from './tool-executor.js'
import Task from '../domain/motor/task.js'
import TaskRunner from './task-runner.js'

const CANCEL_PATTERN = /^(para|stop|cancel|cancelar)$/i

// Tools that trigger background execution when seen in the first tool response
const BACKGROUND_TRIGGER_TOOLS = new Set(['github_setup_workspace'])

/**
 * AgentLoop - Core message handler with session persistence and background task support
 *
 * Flow: message:in → build context → provider.chat → [inline tool loop | background task] → message:out
 */
export default class AgentLoop {
  constructor(bus, provider, contextBuilder, storage, memoryManager, { logger = defaultLogger, toolRegistry = null, taskStore = null, responseTracker = null } = {}) {
    this.bus = bus
    this.provider = provider
    this.contextBuilder = contextBuilder
    this.storage = storage
    this.memory = memoryManager || null
    this.logger = logger
    this.toolRegistry = toolRegistry
    this.taskStore = taskStore
    this.responseTracker = responseTracker
    this._handler = null
    this._activeTasks = new Map() // sessionId → Task
  }

  /**
   * Start the agent loop: register bus listener.
   */
  async start() {
    this._handler = (message) => this._handleMessage(message)
    this.bus.on(MESSAGE_IN, this._handler)

    this.logger.info('agent', 'started', { provider: this.provider.name })
  }

  /**
   * Stop the agent loop: remove bus listener and cancel active tasks.
   */
  stop() {
    if (this._handler) {
      this.bus.off(MESSAGE_IN, this._handler)
      this._handler = null
    }
    for (const task of this._activeTasks.values()) {
      if (task.isActive) task.cancel()
    }
    this._activeTasks.clear()
    this.logger.info('agent', 'stopped')
  }

  /**
   * Get active task for a session (if any).
   */
  getActiveTask(sessionId) {
    const task = this._activeTasks.get(sessionId)
    return task?.isActive ? task : null
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

    // Check for cancel command
    if (this._handleCancel(sessionId, message)) return

    const typingPayload = { chatId: message.chatId, channel: message.channel }
    const start = Date.now()

    try {
      await withTypingIndicator(this.bus, typingPayload, async () => {

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

        // Check if this should be a background task
        if (this._shouldBackground(response)) {
          await this._spawnBackgroundTask({ messages, chatOptions, response, message, sessionId })
          return
        }

        // ReAct loop: execute tools and iterate until final response (inline)
        const maxIterations = this.contextBuilder.config?.maxToolIterations ?? 15
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
        this.responseTracker?.record({ durationMs, toolIterations: iterations })

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
          chatContextSet: stats['chat-context']?.chatContext ? true : undefined,
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
      this.responseTracker?.record({ durationMs: Date.now() - start, error: true })
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

  /**
   * Check if the LLM response should trigger a background task.
   * @private
   */
  _shouldBackground(response) {
    if (!response.toolCalls?.length) return false
    return response.toolCalls.some(tc => BACKGROUND_TRIGGER_TOOLS.has(tc.name))
  }

  /**
   * Handle cancel commands for active tasks.
   * @private
   */
  _handleCancel(sessionId, message) {
    if (!CANCEL_PATTERN.test(message.text.trim())) return false

    const task = this._activeTasks.get(sessionId)
    if (!task?.isActive) return false

    task.cancel()
    this._activeTasks.delete(sessionId)

    this.logger.info('agent', 'task_cancelled', { sessionId, taskId: task.id })

    this.bus.fire(TASK_CANCELLED, {
      taskId: task.id,
      chatId: message.chatId,
      channel: message.channel
    }, { source: 'agent' })

    this.bus.fire(MESSAGE_OUT, {
      chatId: message.chatId,
      text: `Task cancelled. ${task.steps.length} steps completed.`,
      channel: message.channel
    }, { source: 'agent' })

    return true
  }

  /**
   * Spawn a background TaskRunner for a long-running task.
   * @private
   */
  async _spawnBackgroundTask({ messages, chatOptions, response, message, sessionId }) {
    // Check concurrent task limit
    const existingTask = this._activeTasks.get(sessionId)
    if (existingTask?.isActive) {
      this.bus.fire(MESSAGE_OUT, {
        chatId: message.chatId,
        text: 'There is already a task in progress. Send "stop" to cancel it first.',
        channel: message.channel
      }, { source: 'agent' })
      return
    }

    // Create task entity
    const task = new Task({
      chatId: message.chatId,
      channel: message.channel,
      sessionId,
      input: message.text
    })

    this._activeTasks.set(sessionId, task)

    this.bus.fire(TASK_QUEUED, {
      taskId: task.id,
      chatId: message.chatId,
      channel: message.channel,
      input: message.text
    }, { source: 'motor' })

    // Send the LLM's initial text as confirmation (it usually describes its plan)
    const confirmation = response.content || 'Working on it. I\'ll send updates as I make progress.'

    this.bus.fire(MESSAGE_OUT, {
      chatId: message.chatId,
      text: confirmation,
      channel: message.channel
    }, { source: 'agent' })

    // Save session with the confirmation
    const now = Date.now()
    await this.storage.saveSession(sessionId, [
      { role: 'user', content: message.text, timestamp: now - 1 },
      { role: 'assistant', content: confirmation, timestamp: now }
    ])

    // Spawn TaskRunner in background (fire and forget)
    const maxIterations = this.contextBuilder.config?.motor?.maxTaskIterations ?? 30
    const runner = new TaskRunner(this.bus, this.provider, this.toolRegistry, {
      logger: this.logger,
      taskStore: this.taskStore,
      maxIterations
    })

    runner.run(task, { messages, chatOptions, pendingResponse: response })
      .catch(err => this.logger.error('motor', 'task_runner_crash', { taskId: task.id, error: err.message }))
      .finally(() => {
        if (this._activeTasks.get(sessionId) === task) {
          this._activeTasks.delete(sessionId)
        }
      })

    this.logger.info('agent', 'task_spawned', { sessionId, taskId: task.id })
  }
}
