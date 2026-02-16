import { describe, it, expect, vi, beforeEach } from 'vitest'
import NervousSystem from '../../src/domain/nervous/index.js'
import { ToolRegistry } from '../../src/domain/motor/index.js'
import AgentLoop from '../../src/application/loop.js'
import BaseProvider from '../../src/adapters/providers/base.js'
import { MESSAGE_IN, MESSAGE_OUT, TASK_QUEUED, TASK_CANCELLED } from '../../src/infrastructure/events.js'

vi.mock('../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../src/infrastructure/config.js', () => ({
  default: {},
  createConfig: vi.fn(() => ({ config: {}, errors: [] })),
  validateConfig: vi.fn()
}))

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

class ScriptedProvider extends BaseProvider {
  constructor(responses) {
    super()
    this._responses = [...responses]
    this._callIndex = 0
  }

  async chat(messages, options = {}) {
    const response = this._responses[this._callIndex++]
    if (!response) throw new Error('No more scripted responses')
    return response
  }

  get name() { return 'scripted' }
  get supportsTools() { return true }
}

const githubSetupTool = {
  definition: {
    name: 'github_setup_workspace',
    description: 'Setup a GitHub workspace',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        destination: { type: 'string' }
      },
      required: ['repo']
    }
  },
  execute: async ({ repo, destination }) => {
    // Slow execution (200ms) to allow testing concurrent task rejection
    await new Promise(r => setTimeout(r, 200))
    return `Cloned ${repo}${destination ? ` to ${destination}` : ''}`
  }
}

const searchWebTool = {
  definition: {
    name: 'search_web',
    description: 'Search the web',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  execute: async ({ query }) => `Search results for: ${query}`
}

function createToolRegistry() {
  const registry = new ToolRegistry()
  registry.register(githubSetupTool)
  registry.register(searchWebTool)
  return registry
}

function createStorage() {
  return {
    loadSession: vi.fn().mockResolvedValue([]),
    saveSession: vi.fn().mockResolvedValue()
  }
}

function createContextBuilder() {
  return {
    build: vi.fn().mockResolvedValue({
      system: 'test',
      messages: [{ role: 'user', content: 'test' }]
    }),
    config: {
      sessionHistoryLimit: 20,
      maxToolIterations: 5,
      motor: {
        maxTaskIterations: 10,
        maxConcurrentTasks: 1
      }
    },
    cognitive: null
  }
}

function fireAndWait(bus, payload, signal = MESSAGE_OUT) {
  return new Promise(resolve => {
    bus.on(signal, resolve)
    bus.fire(MESSAGE_IN, payload, { source: 'test' })
  })
}

const defaultPayload = { text: 'test', chatId: '123', userId: 'u1', channel: 'test' }

describe('AgentLoop background tasks', () => {
  let bus, storage, contextBuilder, toolRegistry

  beforeEach(() => {
    bus = new NervousSystem()
    storage = createStorage()
    contextBuilder = createContextBuilder()
    toolRegistry = createToolRegistry()
    vi.clearAllMocks()
  })

  it('handles normal message without tools (backward compatibility)', async () => {
    const provider = new ScriptedProvider([
      { content: 'hello', toolCalls: null, stopReason: 'end_turn', rawContent: null, usage: {} }
    ])

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    expect(response.text).toBe('hello')
    expect(response.chatId).toBe('123')
    expect(response.channel).toBe('test')

    loop.stop()
  })

  it('handles inline tool loop for non-trigger tools', async () => {
    const provider = new ScriptedProvider([
      {
        content: '',
        toolCalls: [{ id: 'tc_1', name: 'search_web', input: { query: 'test' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'search_web', input: { query: 'test' } }],
        usage: {}
      },
      {
        content: 'Here are the search results',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    expect(response.text).toBe('Here are the search results')
    expect(storage.saveSession).toHaveBeenCalled()

    loop.stop()
  })

  it('spawns background task when github_setup_workspace detected', async () => {
    const provider = new ScriptedProvider([
      // Response 1: initial call returns github_setup_workspace (triggers background mode)
      {
        content: "I'll clone the repo for you",
        toolCalls: [{ id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
        usage: {}
      },
      // Response 2: TaskRunner executes tool and calls provider again
      {
        content: 'Clone completed successfully',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])

    const taskQueuedEvents = []
    bus.on(TASK_QUEUED, (event) => taskQueuedEvents.push(event))

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const sessionId = 'test-123'
    const response = await fireAndWait(bus, defaultPayload)

    // Verify confirmation message sent immediately
    expect(response.text).toBe("I'll clone the repo for you")
    expect(response.chatId).toBe('123')

    // Verify session saved with confirmation
    expect(storage.saveSession).toHaveBeenCalledWith(
      sessionId,
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'test' }),
        expect.objectContaining({ role: 'assistant', content: "I'll clone the repo for you" })
      ])
    )

    // Verify task was queued
    expect(taskQueuedEvents.length).toBe(1)
    expect(taskQueuedEvents[0].chatId).toBe('123')

    // Verify active task exists
    const activeTask = loop.getActiveTask(sessionId)
    expect(activeTask).not.toBeNull()
    expect(activeTask.sessionId).toBe(sessionId)
    expect(activeTask.isActive).toBe(true)

    // Wait for TaskRunner to process
    await new Promise(r => setTimeout(r, 100))

    loop.stop()
  })

  it('cancels active task when cancel command received', async () => {
    const provider = new ScriptedProvider([
      // Initial response triggers background task
      {
        content: "Cloning repository...",
        toolCalls: [{ id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'large/repo' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'large/repo' } }],
        usage: {}
      },
      // TaskRunner would use this, but task gets cancelled first
      {
        content: 'Would have completed',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])

    const cancelledEvents = []
    bus.on(TASK_CANCELLED, (event) => cancelledEvents.push(event))

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const sessionId = 'test-123'

    // Fire initial message to spawn task
    const response1 = await fireAndWait(bus, defaultPayload)
    expect(response1.text).toBe("Cloning repository...")

    // Verify task is active
    let activeTask = loop.getActiveTask(sessionId)
    expect(activeTask).not.toBeNull()

    // Fire cancel command
    const response2 = await fireAndWait(bus, {
      text: 'stop',
      chatId: '123',
      userId: 'u1',
      channel: 'test'
    })

    // Verify cancel confirmation
    expect(response2.text).toContain('Task cancelled')
    expect(response2.text).toContain('steps completed')

    // Verify task was cancelled
    expect(cancelledEvents.length).toBe(1)
    expect(cancelledEvents[0].chatId).toBe('123')

    // Verify no active task
    activeTask = loop.getActiveTask(sessionId)
    expect(activeTask).toBeNull()

    loop.stop()
  })

  it('rejects concurrent task when one is already running', async () => {
    const provider = new ScriptedProvider([
      // First task
      {
        content: "Cloning first repo...",
        toolCalls: [{ id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'first/repo' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'first/repo' } }],
        usage: {}
      },
      // Second task attempt - provider IS called, returns github_setup_workspace
      {
        content: "Cloning second repo...",
        toolCalls: [{ id: 'tc_2', name: 'github_setup_workspace', input: { repo: 'second/repo' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_2', name: 'github_setup_workspace', input: { repo: 'second/repo' } }],
        usage: {}
      }
    ])

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const sessionId = 'test-123'

    // Spawn first task
    const response1 = await fireAndWait(bus, defaultPayload)
    expect(response1.text).toBe("Cloning first repo...")

    // Manually verify task was created and is active
    let activeTask = loop.getActiveTask(sessionId)
    expect(activeTask).not.toBeNull()
    expect(activeTask.isActive).toBe(true)

    // Try to spawn second task immediately (before first one completes)
    // The github_setup_workspace tool has 200ms delay, so this should arrive while task 1 is still running
    const response2 = await fireAndWait(bus, {
      text: 'clone another repo',
      chatId: '123',
      userId: 'u1',
      channel: 'test'
    })

    // Verify rejection message was sent
    expect(response2.text).toBe('There is already a task in progress. Send "stop" to cancel it first.')

    // Verify still only one active task
    activeTask = loop.getActiveTask(sessionId)
    expect(activeTask).not.toBeNull()
    expect(activeTask.input).toBe('test') // Still the first task

    // Clean up: wait for first task to finish
    await new Promise(r => setTimeout(r, 250))

    loop.stop()
  })

  it('treats cancel as normal message when no active task', async () => {
    const provider = new ScriptedProvider([
      {
        content: 'There is no active task to cancel',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])

    const cancelledEvents = []
    bus.on(TASK_CANCELLED, (event) => cancelledEvents.push(event))

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const sessionId = 'test-123'

    // Verify no active task
    let activeTask = loop.getActiveTask(sessionId)
    expect(activeTask).toBeNull()

    // Send cancel command (should be treated as normal message)
    const response = await fireAndWait(bus, {
      text: 'cancel',
      chatId: '123',
      userId: 'u1',
      channel: 'test'
    })

    // Verify it was processed as a normal message (not consumed as cancel)
    expect(response.text).toBe('There is no active task to cancel')

    // Verify no TASK_CANCELLED event fired
    expect(cancelledEvents.length).toBe(0)

    // Verify provider was called (message was processed normally)
    expect(contextBuilder.build).toHaveBeenCalled()

    loop.stop()
  })

  it('recognizes different cancel command variants', async () => {
    const cancelWords = ['para', 'stop', 'cancel', 'cancelar', 'STOP', 'Para', 'CANCELAR']

    for (const word of cancelWords) {
      const provider = new ScriptedProvider([
        // Spawn a task
        {
          content: "Working...",
          toolCalls: [{ id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
          stopReason: 'tool_use',
          rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
          usage: {}
        },
        // TaskRunner response
        {
          content: 'Done',
          toolCalls: null,
          stopReason: 'end_turn',
          rawContent: null,
          usage: {}
        }
      ])

      const cancelledEvents = []
      const bus = new NervousSystem()
      bus.on(TASK_CANCELLED, (event) => cancelledEvents.push(event))

      const loop = new AgentLoop(bus, provider, contextBuilder, createStorage(), null, { logger, toolRegistry })
      await loop.start()

      const sessionId = 'test-123'

      // Spawn task
      await fireAndWait(bus, defaultPayload)

      // Verify task active
      let activeTask = loop.getActiveTask(sessionId)
      expect(activeTask).not.toBeNull()

      // Send cancel word
      await fireAndWait(bus, {
        text: word,
        chatId: '123',
        userId: 'u1',
        channel: 'test'
      })

      // Verify task was cancelled
      expect(cancelledEvents.length).toBe(1)
      activeTask = loop.getActiveTask(sessionId)
      expect(activeTask).toBeNull()

      loop.stop()
    }
  })

  it('handles github_setup_workspace with text content', async () => {
    const provider = new ScriptedProvider([
      {
        content: "Sure! I'll clone that repository for you.",
        toolCalls: [{ id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'user/project', destination: '/tmp/test' } }],
        stopReason: 'tool_use',
        rawContent: [
          { type: 'text', text: "Sure! I'll clone that repository for you." },
          { type: 'tool_use', id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'user/project', destination: '/tmp/test' } }
        ],
        usage: {}
      },
      {
        content: 'Repository cloned successfully',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])

    const taskQueuedEvents = []
    bus.on(TASK_QUEUED, (event) => taskQueuedEvents.push(event))

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    // Verify the LLM's text was sent as confirmation
    expect(response.text).toBe("Sure! I'll clone that repository for you.")

    // Verify task was queued
    expect(taskQueuedEvents.length).toBe(1)

    loop.stop()
  })

  it('uses fallback confirmation when response has no content', async () => {
    const provider = new ScriptedProvider([
      {
        content: '', // Empty content
        toolCalls: [{ id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
        usage: {}
      },
      {
        content: 'Done',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    // Verify fallback confirmation was used
    expect(response.text).toBe("Working on it. I'll send updates as I make progress.")

    loop.stop()
  })

  it('returns null from getActiveTask when task exists but is not active', async () => {
    const provider = new ScriptedProvider([
      {
        content: "Working...",
        toolCalls: [{ id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'github_setup_workspace', input: { repo: 'test/repo' } }],
        usage: {}
      },
      {
        content: 'Done',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const sessionId = 'test-123'

    // Spawn task
    await fireAndWait(bus, defaultPayload)

    // Get the task and manually mark it as not active (simulate completion)
    const task = loop._activeTasks.get(sessionId)
    expect(task).not.toBeNull()

    // Manually cancel to make it inactive
    task.cancel()

    // getActiveTask should return null even though task exists in map
    const activeTask = loop.getActiveTask(sessionId)
    expect(activeTask).toBeNull()

    loop.stop()
  })
})
