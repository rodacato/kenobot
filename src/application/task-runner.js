import defaultLogger from '../infrastructure/logger.js'
import { TASK_STARTED, TASK_PROGRESS, TASK_COMPLETED, TASK_FAILED } from '../infrastructure/events.js'
import { executeToolCalls } from './tool-executor.js'

/**
 * TaskRunner — runs a ReAct loop in the background for a single task.
 *
 * Picks up mid-conversation from where the AgentLoop detected a background task.
 * Fires bus signals for progress and completion so the user gets Telegram updates.
 */
export default class TaskRunner {
  constructor(bus, provider, toolRegistry, { logger = defaultLogger, taskStore = null, maxIterations = 30 } = {}) {
    this.bus = bus
    this.provider = provider
    this.toolRegistry = toolRegistry
    this.logger = logger
    this.taskStore = taskStore
    this.maxIterations = maxIterations
  }

  /**
   * Run a task to completion (or cancellation/failure).
   *
   * @param {Task} task - Task entity
   * @param {Object} handoff - State from AgentLoop at the point of backgrounding
   * @param {Array} handoff.messages - Conversation messages so far
   * @param {Object} handoff.chatOptions - Provider options (system prompt, tools)
   * @param {Object} handoff.pendingResponse - LLM response with tool_calls to execute
   */
  async run(task, { messages, chatOptions, pendingResponse }) {
    task.start()
    const { chatId, channel, id: taskId } = task

    this.bus.fire(TASK_STARTED, { taskId, chatId, channel }, { source: 'motor' })
    await this._logEvent(taskId, { event: 'started', input: task.input })

    let currentMessages = [...messages]
    let response = pendingResponse
    let iterations = 0

    try {
      while (response.stopReason === 'tool_use' && response.toolCalls?.length && !task.isCancelled && iterations < this.maxIterations) {
        iterations++

        const toolNames = response.toolCalls.map(t => t.name)
        this.logger.info('motor', 'task_iteration', { taskId, iteration: iterations, tools: toolNames })

        // Execute tools
        const results = await executeToolCalls(response.toolCalls, this.toolRegistry, { logger: this.logger })
        const toolMessages = this.provider.buildToolResultMessages(response.rawContent, results)
        currentMessages = [...currentMessages, ...toolMessages]

        // Log step
        task.addStep({ iteration: iterations, tools: toolNames, results: results.map(r => ({ id: r.id, isError: r.isError })) })
        await this._logEvent(taskId, { event: 'step', iteration: iterations, tools: toolNames })

        // Call provider for next step
        response = await this.provider.chatWithRetry(currentMessages, chatOptions)

        // Fire progress when LLM includes text alongside tool calls
        if (response.content && response.stopReason === 'tool_use') {
          this.bus.fire(TASK_PROGRESS, { taskId, chatId, text: response.content, channel }, { source: 'motor' })
        }
      }

      if (task.isCancelled) {
        this.logger.info('motor', 'task_cancelled', { taskId, iterations })
        await this._logEvent(taskId, { event: 'cancelled', iterations })
        return
      }

      if (iterations >= this.maxIterations && response.stopReason === 'tool_use') {
        this.logger.warn('motor', 'task_max_iterations', { taskId, maxIterations: this.maxIterations })
      }

      // Task complete — fire result
      const text = response.content || 'Task completed.'
      task.complete(text)

      this.bus.fire(TASK_COMPLETED, { taskId, chatId, text, channel }, { source: 'motor' })
      await this._logEvent(taskId, { event: 'completed', iterations, resultLength: text.length })

      this.logger.info('motor', 'task_completed', { taskId, iterations, resultLength: text.length })
    } catch (error) {
      task.fail(error)

      this.bus.fire(TASK_FAILED, { taskId, chatId, error: error.message, channel }, { source: 'motor' })
      await this._logEvent(taskId, { event: 'failed', error: error.message, iterations })

      this.logger.error('motor', 'task_failed', { taskId, error: error.message, iterations })
    }
  }

  async _logEvent(taskId, event) {
    if (this.taskStore) {
      try {
        await this.taskStore.appendEvent(taskId, event)
      } catch (err) {
        this.logger.warn('motor', 'task_log_failed', { taskId, error: err.message })
      }
    }
  }
}
