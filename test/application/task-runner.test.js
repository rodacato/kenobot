import { describe, it, expect, vi, beforeEach } from 'vitest'
import TaskRunner from '../../src/application/task-runner.js'
import Task from '../../src/domain/motor/task.js'
import { ToolRegistry } from '../../src/domain/motor/index.js'
import NervousSystem from '../../src/domain/nervous/index.js'
import BaseProvider from '../../src/adapters/providers/base.js'
import { TASK_STARTED, TASK_PROGRESS, TASK_COMPLETED, TASK_FAILED } from '../../src/infrastructure/events.js'

vi.mock('../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../src/infrastructure/config.js', () => ({
  default: {},
  createConfig: vi.fn(() => ({ config: {}, errors: [] })),
  validateConfig: vi.fn()
}))

/**
 * ScriptedProvider — returns pre-configured responses in sequence.
 * Used to control exactly what the TaskRunner sees from the LLM.
 */
class ScriptedProvider extends BaseProvider {
  constructor(responses) {
    super()
    this._responses = [...responses]
    this._callIndex = 0
  }

  async chat(messages, options) {
    if (this._callIndex >= this._responses.length) {
      throw new Error('ScriptedProvider ran out of responses')
    }
    return this._responses[this._callIndex++]
  }

  get supportsTools() {
    return true
  }

  get name() {
    return 'scripted'
  }
}

describe('TaskRunner', () => {
  let bus
  let toolRegistry
  let task

  beforeEach(() => {
    bus = new NervousSystem()
    toolRegistry = new ToolRegistry()
    task = new Task({
      chatId: '12345',
      channel: 'telegram',
      sessionId: 'session-1',
      input: 'test task'
    })
  })

  describe('Runs to completion', () => {
    it('should complete task when provider returns tool_use then end_turn', async () => {
      // Register a simple test tool
      toolRegistry.register({
        definition: {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object', properties: {} }
        },
        execute: async () => 'tool executed'
      })

      // Provider responses: tool_use, then end_turn
      const provider = new ScriptedProvider([
        {
          content: 'Using the tool',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_1', name: 'test_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Using the tool' },
            { type: 'tool_use', id: 'call_1', name: 'test_tool', input: {} }
          ]
        },
        {
          content: 'Task is done.',
          stopReason: 'end_turn',
          toolCalls: null,
          rawContent: [{ type: 'text', text: 'Task is done.' }]
        }
      ])

      const runner = new TaskRunner(bus, provider, toolRegistry)

      // Listen for bus signals
      const signals = []
      bus.on(TASK_STARTED, (payload) => signals.push({ type: 'started', payload }))
      bus.on(TASK_COMPLETED, (payload) => signals.push({ type: 'completed', payload }))

      await runner.run(task, {
        messages: [{ role: 'user', content: 'do something' }],
        chatOptions: { model: 'test' },
        pendingResponse: {
          content: 'Using the tool',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_1', name: 'test_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Using the tool' },
            { type: 'tool_use', id: 'call_1', name: 'test_tool', input: {} }
          ]
        }
      })

      expect(task.status).toBe('completed')
      expect(task.result).toBe('Task is done.')
      expect(signals).toHaveLength(2)
      expect(signals[0].type).toBe('started')
      expect(signals[0].payload.taskId).toBe(task.id)
      expect(signals[1].type).toBe('completed')
      expect(signals[1].payload.taskId).toBe(task.id)
      expect(signals[1].payload.text).toBe('Task is done.')
    })
  })

  describe('Fires TASK_PROGRESS', () => {
    it('should fire TASK_PROGRESS when tool_use response includes text content', async () => {
      toolRegistry.register({
        definition: {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object', properties: {} }
        },
        execute: async () => 'tool executed'
      })

      // Provider returns tool_use with text, then end_turn
      const provider = new ScriptedProvider([
        {
          content: 'Processing step 1',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_2', name: 'test_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Processing step 1' },
            { type: 'tool_use', id: 'call_2', name: 'test_tool', input: {} }
          ]
        },
        {
          content: 'All done.',
          stopReason: 'end_turn',
          toolCalls: null,
          rawContent: [{ type: 'text', text: 'All done.' }]
        }
      ])

      const runner = new TaskRunner(bus, provider, toolRegistry)

      const signals = []
      bus.on(TASK_PROGRESS, (payload) => signals.push({ type: 'progress', payload }))

      await runner.run(task, {
        messages: [{ role: 'user', content: 'do something' }],
        chatOptions: { model: 'test' },
        pendingResponse: {
          content: 'Processing step 1',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_2', name: 'test_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Processing step 1' },
            { type: 'tool_use', id: 'call_2', name: 'test_tool', input: {} }
          ]
        }
      })

      const progressSignals = signals.filter(s => s.type === 'progress')
      expect(progressSignals).toHaveLength(1)
      expect(progressSignals[0].payload.taskId).toBe(task.id)
      expect(progressSignals[0].payload.text).toBe('Processing step 1')
    })
  })

  describe('Handles cancellation', () => {
    it('should stop loop when task is cancelled mid-execution', async () => {
      // Create a tool that cancels the task
      let capturedTask = null
      toolRegistry.register({
        definition: {
          name: 'cancel_self',
          description: 'Test cancellation',
          input_schema: { type: 'object', properties: {} }
        },
        execute: async () => {
          capturedTask.cancel()
          return 'cancelled'
        }
      })

      capturedTask = task

      // Provider is called once after tool execution in the same iteration,
      // then loop exits on next iteration check
      const provider = new ScriptedProvider([
        {
          content: 'Response after cancel',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_next', name: 'cancel_self', input: {} }],
          rawContent: [
            { type: 'text', text: 'Response after cancel' },
            { type: 'tool_use', id: 'call_next', name: 'cancel_self', input: {} }
          ]
        }
      ])

      const runner = new TaskRunner(bus, provider, toolRegistry)

      await runner.run(task, {
        messages: [{ role: 'user', content: 'do something' }],
        chatOptions: { model: 'test' },
        pendingResponse: {
          content: 'Cancelling',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_3', name: 'cancel_self', input: {} }],
          rawContent: [
            { type: 'text', text: 'Cancelling' },
            { type: 'tool_use', id: 'call_3', name: 'cancel_self', input: {} }
          ]
        }
      })

      expect(task.status).toBe('cancelled')
      // Provider is called once in the same iteration where cancellation happens
      expect(provider._callIndex).toBe(1)
    })
  })

  describe('Handles provider errors', () => {
    it('should mark task as failed and fire TASK_FAILED when provider throws', async () => {
      toolRegistry.register({
        definition: {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object', properties: {} }
        },
        execute: async () => 'tool executed'
      })

      // Provider throws on first call
      const provider = new ScriptedProvider([])
      provider.chat = async () => {
        throw new Error('Provider API error')
      }

      const runner = new TaskRunner(bus, provider, toolRegistry)

      const signals = []
      bus.on(TASK_FAILED, (payload) => signals.push({ type: 'failed', payload }))

      await runner.run(task, {
        messages: [{ role: 'user', content: 'do something' }],
        chatOptions: { model: 'test' },
        pendingResponse: {
          content: 'Using tool',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_4', name: 'test_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool_use', id: 'call_4', name: 'test_tool', input: {} }
          ]
        }
      })

      expect(task.status).toBe('failed')
      expect(task.error).toBe('Provider API error')
      expect(signals).toHaveLength(1)
      expect(signals[0].type).toBe('failed')
      expect(signals[0].payload.error).toBe('Provider API error')
    })
  })

  describe('Respects max iterations', () => {
    it('should stop loop after maxIterations even if provider keeps returning tool_use', async () => {
      toolRegistry.register({
        definition: {
          name: 'infinite_tool',
          description: 'A tool that keeps calling',
          input_schema: { type: 'object', properties: {} }
        },
        execute: async () => 'iteration'
      })

      // Provider always returns tool_use (infinite loop scenario)
      const provider = new ScriptedProvider([
        {
          content: 'Iteration 1',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_5', name: 'infinite_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Iteration 1' },
            { type: 'tool_use', id: 'call_5', name: 'infinite_tool', input: {} }
          ]
        },
        {
          content: 'Iteration 2',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_6', name: 'infinite_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Iteration 2' },
            { type: 'tool_use', id: 'call_6', name: 'infinite_tool', input: {} }
          ]
        },
        {
          content: 'Iteration 3 (should not reach)',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_7', name: 'infinite_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Iteration 3 (should not reach)' },
            { type: 'tool_use', id: 'call_7', name: 'infinite_tool', input: {} }
          ]
        }
      ])

      const runner = new TaskRunner(bus, provider, toolRegistry, { maxIterations: 2 })

      await runner.run(task, {
        messages: [{ role: 'user', content: 'do something' }],
        chatOptions: { model: 'test' },
        pendingResponse: {
          content: 'Starting',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_0', name: 'infinite_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Starting' },
            { type: 'tool_use', id: 'call_0', name: 'infinite_tool', input: {} }
          ]
        }
      })

      expect(task.status).toBe('completed')
      expect(task.steps).toHaveLength(2) // Only 2 iterations
      // Provider called twice (responses[0] and responses[1])
      expect(provider._callIndex).toBe(2)
    })
  })

  describe('Logs events to taskStore', () => {
    it('should call taskStore.appendEvent for each lifecycle event', async () => {
      toolRegistry.register({
        definition: {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object', properties: {} }
        },
        execute: async () => 'tool executed'
      })

      const provider = new ScriptedProvider([
        {
          content: 'Done',
          stopReason: 'end_turn',
          toolCalls: null,
          rawContent: [{ type: 'text', text: 'Done' }]
        }
      ])

      const taskStore = {
        appendEvent: vi.fn()
      }

      const runner = new TaskRunner(bus, provider, toolRegistry, { taskStore })

      await runner.run(task, {
        messages: [{ role: 'user', content: 'do something' }],
        chatOptions: { model: 'test' },
        pendingResponse: {
          content: 'Using tool',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_8', name: 'test_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool_use', id: 'call_8', name: 'test_tool', input: {} }
          ]
        }
      })

      expect(taskStore.appendEvent).toHaveBeenCalledTimes(3)

      // First call: started event
      expect(taskStore.appendEvent).toHaveBeenNthCalledWith(1, task.id, {
        event: 'started',
        input: 'test task'
      })

      // Second call: step event
      expect(taskStore.appendEvent).toHaveBeenNthCalledWith(2, task.id, {
        event: 'step',
        iteration: 1,
        tools: ['test_tool']
      })

      // Third call: completed event
      expect(taskStore.appendEvent).toHaveBeenNthCalledWith(3, task.id, {
        event: 'completed',
        iterations: 1,
        resultLength: 4 // 'Done'.length
      })
    })

    it('should handle taskStore.appendEvent errors gracefully', async () => {
      toolRegistry.register({
        definition: {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: { type: 'object', properties: {} }
        },
        execute: async () => 'tool executed'
      })

      const provider = new ScriptedProvider([
        {
          content: 'Done',
          stopReason: 'end_turn',
          toolCalls: null,
          rawContent: [{ type: 'text', text: 'Done' }]
        }
      ])

      const taskStore = {
        appendEvent: vi.fn().mockRejectedValue(new Error('Storage error'))
      }

      const runner = new TaskRunner(bus, provider, toolRegistry, { taskStore })

      // Should not throw, just log warnings
      await runner.run(task, {
        messages: [{ role: 'user', content: 'do something' }],
        chatOptions: { model: 'test' },
        pendingResponse: {
          content: 'Using tool',
          stopReason: 'tool_use',
          toolCalls: [{ id: 'call_9', name: 'test_tool', input: {} }],
          rawContent: [
            { type: 'text', text: 'Using tool' },
            { type: 'tool_use', id: 'call_9', name: 'test_tool', input: {} }
          ]
        }
      })

      expect(task.status).toBe('completed')
      expect(taskStore.appendEvent).toHaveBeenCalled()
    })
  })
})
