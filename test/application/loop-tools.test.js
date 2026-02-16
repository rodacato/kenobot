import { describe, it, expect, vi, beforeEach } from 'vitest'
import NervousSystem from '../../src/domain/nervous/index.js'
import { ToolRegistry } from '../../src/domain/motor/index.js'
import AgentLoop from '../../src/application/loop.js'
import BaseProvider from '../../src/adapters/providers/base.js'
import { MESSAGE_IN, MESSAGE_OUT } from '../../src/infrastructure/events.js'

vi.mock('../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../src/infrastructure/config.js', () => ({
  default: {}
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

const testTool = {
  definition: {
    name: 'test_tool',
    description: 'Test',
    input_schema: {
      type: 'object',
      properties: { input: { type: 'string' } },
      required: ['input']
    }
  },
  execute: async ({ input }) => `result: ${input}`
}

function createToolRegistry() {
  const registry = new ToolRegistry()
  registry.register(testTool)
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
    config: { sessionHistoryLimit: 20, maxToolIterations: 5 },
    cognitive: null
  }
}

function fireAndWait(bus, payload) {
  return new Promise(resolve => {
    bus.on(MESSAGE_OUT, resolve)
    bus.fire(MESSAGE_IN, payload, { source: 'test' })
  })
}

const defaultPayload = { text: 'test', chatId: '123', userId: 'u1', channel: 'test' }

describe('AgentLoop tool integration', () => {
  let bus, storage, contextBuilder

  beforeEach(() => {
    bus = new NervousSystem()
    storage = createStorage()
    contextBuilder = createContextBuilder()
  })

  it('handles normal message without tools', async () => {
    const provider = new ScriptedProvider([
      { content: 'hello', toolCalls: null, stopReason: 'end_turn', rawContent: null, usage: {} }
    ])

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    expect(response.text).toBe('hello')
    expect(response.chatId).toBe('123')
    expect(response.channel).toBe('test')

    loop.stop()
  })

  it('handles single tool iteration', async () => {
    const provider = new ScriptedProvider([
      {
        content: '',
        toolCalls: [{ id: 'tc_1', name: 'test_tool', input: { input: 'foo' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'tc_1', name: 'test_tool', input: { input: 'foo' } }],
        usage: {}
      },
      {
        content: 'done with tool',
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: {}
      }
    ])
    const toolRegistry = createToolRegistry()

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    expect(response.text).toBe('done with tool')

    loop.stop()
  })

  it('stops after max iterations', async () => {
    const toolUseResponse = {
      content: '',
      toolCalls: [{ id: 'tc_loop', name: 'test_tool', input: { input: 'again' } }],
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'tc_loop', name: 'test_tool', input: { input: 'again' } }],
      usage: {}
    }

    // Provider always returns tool_use — the loop should stop after maxToolIterations
    const provider = new ScriptedProvider([
      toolUseResponse, // initial call
      toolUseResponse, // iteration 1
      toolUseResponse  // iteration 2
    ])
    const chatSpy = vi.spyOn(provider, 'chat')

    const toolRegistry = createToolRegistry()
    contextBuilder.config.maxToolIterations = 2

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    // initial call + 2 iterations = 3 calls total
    expect(chatSpy.mock.calls.length).toBe(3)
    // Loop exhausted iterations — response is from last tool_use (empty content)
    expect(response).toBeDefined()

    loop.stop()
  })

  it('works without toolRegistry', async () => {
    const provider = new ScriptedProvider([
      { content: 'no tools here', toolCalls: null, stopReason: 'end_turn', rawContent: null, usage: {} }
    ])

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    expect(response.text).toBe('no tools here')

    loop.stop()
  })

  it('does not pass tools when provider has supportsTools=false', async () => {
    class NoToolsProvider extends BaseProvider {
      constructor(response) {
        super()
        this._response = response
      }
      async chat(messages, options = {}) {
        // Capture options for assertion
        this._lastOptions = options
        return this._response
      }
      get name() { return 'no-tools' }
      get supportsTools() { return false }
    }

    const provider = new NoToolsProvider(
      { content: 'plain answer', toolCalls: null, stopReason: 'end_turn', rawContent: null, usage: {} }
    )
    const chatSpy = vi.spyOn(provider, 'chat')
    const toolRegistry = createToolRegistry()

    const loop = new AgentLoop(bus, provider, contextBuilder, storage, null, { logger, toolRegistry })
    await loop.start()

    const response = await fireAndWait(bus, defaultPayload)

    expect(response.text).toBe('plain answer')
    // chat was called with options that do NOT include tools
    const callOptions = chatSpy.mock.calls[0][1]
    expect(callOptions.tools).toBeUndefined()

    loop.stop()
  })
})
