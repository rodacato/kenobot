import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import AgentLoop from '../../src/agent/loop.js'

describe('AgentLoop', () => {
  let agent
  let bus
  let provider
  let contextBuilder
  let storage

  beforeEach(() => {
    bus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }

    provider = {
      name: 'mock',
      chat: vi.fn().mockResolvedValue({ content: 'bot response' }),
      chatWithRetry: vi.fn().mockResolvedValue({ content: 'bot response' }),
      buildToolResultMessages(rawContent, results) {
        return [
          { role: 'assistant', content: rawContent },
          {
            role: 'user',
            content: results.map(r => ({
              type: 'tool_result',
              tool_use_id: r.id,
              content: r.result,
              is_error: r.isError
            }))
          }
        ]
      }
    }

    contextBuilder = {
      loadIdentity: vi.fn().mockResolvedValue(undefined),
      build: vi.fn().mockResolvedValue({
        system: '# Identity',
        messages: [{ role: 'user', content: 'hello' }]
      })
    }

    storage = {
      saveSession: vi.fn().mockResolvedValue(undefined)
    }

    agent = new AgentLoop(bus, provider, contextBuilder, storage)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('start', () => {
    it('should load identity on start', async () => {
      await agent.start()

      expect(contextBuilder.loadIdentity).toHaveBeenCalledOnce()
    })

    it('should register message:in listener', async () => {
      await agent.start()

      expect(bus.on).toHaveBeenCalledWith('message:in', expect.any(Function))
    })
  })

  describe('stop', () => {
    it('should remove message:in listener', async () => {
      await agent.start()
      agent.stop()

      expect(bus.off).toHaveBeenCalledWith('message:in', expect.any(Function))
    })

    it('should not throw if called before start', () => {
      expect(() => agent.stop()).not.toThrow()
    })
  })

  describe('_handleMessage', () => {
    const message = {
      text: 'hello bot',
      chatId: '123',
      userId: '456',
      channel: 'telegram'
    }

    it('should derive sessionId from channel and chatId', async () => {
      await agent._handleMessage(message)

      expect(contextBuilder.build).toHaveBeenCalledWith(
        'telegram-123',
        message
      )
    })

    it('should build context and call provider', async () => {
      await agent._handleMessage(message)

      expect(contextBuilder.build).toHaveBeenCalledOnce()
      expect(provider.chatWithRetry).toHaveBeenCalledWith(
        [{ role: 'user', content: 'hello' }],
        { system: '# Identity' }
      )
    })

    it('should save both user and assistant messages to session', async () => {
      await agent._handleMessage(message)

      expect(storage.saveSession).toHaveBeenCalledWith(
        'telegram-123',
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'hello bot' }),
          expect.objectContaining({ role: 'assistant', content: 'bot response' })
        ])
      )
    })

    it('should include timestamps in saved messages', async () => {
      await agent._handleMessage(message)

      const savedMessages = storage.saveSession.mock.calls[0][1]
      expect(savedMessages[0]).toHaveProperty('timestamp')
      expect(savedMessages[1]).toHaveProperty('timestamp')
      expect(typeof savedMessages[0].timestamp).toBe('number')
    })

    it('should emit message:out with response', async () => {
      await agent._handleMessage(message)

      expect(bus.emit).toHaveBeenCalledWith('message:out', {
        chatId: '123',
        text: 'bot response',
        channel: 'telegram'
      })
    })

    it('should emit thinking:start before processing', async () => {
      await agent._handleMessage(message)

      expect(bus.emit).toHaveBeenCalledWith('thinking:start', {
        chatId: '123',
        channel: 'telegram'
      })
    })

    it('should emit error message on provider failure', async () => {
      provider.chatWithRetry.mockRejectedValue(new Error('API timeout'))

      await agent._handleMessage(message)

      expect(bus.emit).toHaveBeenCalledWith('message:out', {
        chatId: '123',
        text: 'Error: API timeout',
        channel: 'telegram'
      })
    })

    it('should not save session on provider failure', async () => {
      provider.chatWithRetry.mockRejectedValue(new Error('API timeout'))

      await agent._handleMessage(message)

      expect(storage.saveSession).not.toHaveBeenCalled()
    })

    it('should handle context build failure', async () => {
      contextBuilder.build.mockRejectedValue(new Error('storage read failed'))

      await agent._handleMessage(message)

      expect(bus.emit).toHaveBeenCalledWith('message:out', {
        chatId: '123',
        text: 'Error: storage read failed',
        channel: 'telegram'
      })
    })
  })

  describe('memory extraction', () => {
    let memoryManager

    const message = {
      text: 'remember I prefer Spanish',
      chatId: '123',
      userId: '456',
      channel: 'telegram'
    }

    beforeEach(() => {
      memoryManager = {
        appendDaily: vi.fn().mockResolvedValue(undefined)
      }

      agent = new AgentLoop(bus, provider, contextBuilder, storage, memoryManager)
      vi.clearAllMocks()
    })

    it('should extract memory tags and save to daily log', async () => {
      provider.chatWithRetry.mockResolvedValue({
        content: 'Got it!\n<memory>User prefers Spanish</memory>'
      })

      await agent._handleMessage(message)

      expect(memoryManager.appendDaily).toHaveBeenCalledWith('User prefers Spanish')
    })

    it('should send clean text without memory tags to user', async () => {
      provider.chatWithRetry.mockResolvedValue({
        content: 'Got it!\n<memory>User prefers Spanish</memory>'
      })

      await agent._handleMessage(message)

      expect(bus.emit).toHaveBeenCalledWith('message:out', {
        chatId: '123',
        text: 'Got it!',
        channel: 'telegram'
      })
    })

    it('should save clean text to session history', async () => {
      provider.chatWithRetry.mockResolvedValue({
        content: 'Sure!\n<memory>some fact</memory>'
      })

      await agent._handleMessage(message)

      const savedMessages = storage.saveSession.mock.calls[0][1]
      expect(savedMessages[1].content).toBe('Sure!')
      expect(savedMessages[1].content).not.toContain('<memory>')
    })

    it('should handle multiple memory tags', async () => {
      provider.chatWithRetry.mockResolvedValue({
        content: 'OK!\n<memory>fact one</memory>\n<memory>fact two</memory>'
      })

      await agent._handleMessage(message)

      expect(memoryManager.appendDaily).toHaveBeenCalledTimes(2)
      expect(memoryManager.appendDaily).toHaveBeenCalledWith('fact one')
      expect(memoryManager.appendDaily).toHaveBeenCalledWith('fact two')
    })

    it('should not call memoryManager when no tags present', async () => {
      provider.chatWithRetry.mockResolvedValue({ content: 'plain response' })

      await agent._handleMessage(message)

      expect(memoryManager.appendDaily).not.toHaveBeenCalled()
    })

    it('should work without memoryManager (backward compatible)', async () => {
      const agentNoMemory = new AgentLoop(bus, provider, contextBuilder, storage)
      provider.chatWithRetry.mockResolvedValue({
        content: 'response\n<memory>orphan tag</memory>'
      })

      await agentNoMemory._handleMessage(message)

      // Should still clean the tags even without memoryManager
      expect(bus.emit).toHaveBeenCalledWith('message:out', {
        chatId: '123',
        text: 'response',
        channel: 'telegram'
      })
    })
  })

  describe('tool execution loop', () => {
    let toolRegistry

    const message = {
      text: 'fetch https://example.com',
      chatId: '123',
      userId: '456',
      channel: 'telegram'
    }

    beforeEach(() => {
      toolRegistry = {
        getDefinitions: vi.fn().mockReturnValue([
          { name: 'web_fetch', description: 'Fetch URL', input_schema: {} }
        ]),
        execute: vi.fn().mockResolvedValue('Page content here'),
        matchTrigger: vi.fn().mockReturnValue(null),
        size: 1
      }

      agent = new AgentLoop(bus, provider, contextBuilder, storage, null, toolRegistry)
      vi.clearAllMocks()
    })

    it('should pass tool definitions to provider', async () => {
      provider.chatWithRetry.mockResolvedValue({ content: 'text response', toolCalls: null })

      await agent._handleMessage(message)

      expect(provider.chatWithRetry).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          tools: [{ name: 'web_fetch', description: 'Fetch URL', input_schema: {} }]
        })
      )
    })

    it('should execute tool when provider returns tool_use', async () => {
      provider.chatWithRetry
        .mockResolvedValueOnce({
          content: "I'll fetch that.",
          toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: { url: 'https://example.com' } }],
          stopReason: 'tool_use',
          rawContent: [
            { type: 'text', text: "I'll fetch that." },
            { type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: { url: 'https://example.com' } }
          ]
        })
        .mockResolvedValueOnce({
          content: 'The page says: Page content here',
          toolCalls: null,
          stopReason: 'end_turn',
          rawContent: null
        })

      await agent._handleMessage(message)

      expect(toolRegistry.execute).toHaveBeenCalledWith(
        'web_fetch',
        { url: 'https://example.com' },
        { chatId: '123', userId: '456', channel: 'telegram' }
      )
      expect(bus.emit).toHaveBeenCalledWith('message:out', expect.objectContaining({
        text: 'The page says: Page content here'
      }))
    })

    it('should send tool results back to provider', async () => {
      provider.chatWithRetry
        .mockResolvedValueOnce({
          content: 'Fetching...',
          toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: { url: 'https://example.com' } }],
          stopReason: 'tool_use',
          rawContent: [
            { type: 'text', text: 'Fetching...' },
            { type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: { url: 'https://example.com' } }
          ]
        })
        .mockResolvedValueOnce({
          content: 'Done.',
          toolCalls: null,
          stopReason: 'end_turn'
        })

      await agent._handleMessage(message)

      // Second call should include tool result messages
      const secondCallMessages = provider.chatWithRetry.mock.calls[1][0]
      const lastMessage = secondCallMessages[secondCallMessages.length - 1]
      expect(lastMessage.role).toBe('user')
      expect(lastMessage.content).toEqual([
        expect.objectContaining({
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: 'Page content here',
          is_error: false
        })
      ])
    })

    it('should handle tool execution errors gracefully', async () => {
      toolRegistry.execute.mockRejectedValue(new Error('Network timeout'))

      provider.chatWithRetry
        .mockResolvedValueOnce({
          content: 'Fetching...',
          toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: { url: 'https://bad.com' } }],
          stopReason: 'tool_use',
          rawContent: [{ type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: { url: 'https://bad.com' } }]
        })
        .mockResolvedValueOnce({
          content: 'I could not fetch that URL.',
          toolCalls: null,
          stopReason: 'end_turn'
        })

      await agent._handleMessage(message)

      // Error should be passed as tool_result with is_error: true
      const secondCallMessages = provider.chatWithRetry.mock.calls[1][0]
      const lastMessage = secondCallMessages[secondCallMessages.length - 1]
      expect(lastMessage.content[0]).toEqual(expect.objectContaining({
        type: 'tool_result',
        content: 'Error: Network timeout',
        is_error: true
      }))
    })

    it('should respect max iterations safety valve', async () => {
      agent.maxToolIterations = 2

      // Always return tool_use to force hitting the limit
      provider.chatWithRetry.mockResolvedValue({
        content: 'Trying again...',
        toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: { url: 'https://loop.com' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: { url: 'https://loop.com' } }]
      })

      await agent._handleMessage(message)

      // Should have called chat 3 times: initial + 2 iterations
      expect(provider.chatWithRetry).toHaveBeenCalledTimes(3)
      expect(bus.emit).toHaveBeenCalledWith('message:out', expect.objectContaining({
        text: "I'm having trouble completing this task. Let me try a different approach."
      }))
    })

    it('should handle multi-tool calls in parallel', async () => {
      provider.chatWithRetry
        .mockResolvedValueOnce({
          content: "I'll fetch both.",
          toolCalls: [
            { id: 'toolu_1', name: 'web_fetch', input: { url: 'https://a.com' } },
            { id: 'toolu_2', name: 'web_fetch', input: { url: 'https://b.com' } }
          ],
          stopReason: 'tool_use',
          rawContent: [
            { type: 'text', text: "I'll fetch both." },
            { type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: { url: 'https://a.com' } },
            { type: 'tool_use', id: 'toolu_2', name: 'web_fetch', input: { url: 'https://b.com' } }
          ]
        })
        .mockResolvedValueOnce({
          content: 'Both pages fetched.',
          toolCalls: null,
          stopReason: 'end_turn'
        })

      await agent._handleMessage(message)

      // Both tools should be executed
      expect(toolRegistry.execute).toHaveBeenCalledTimes(2)
      // Second call should have both tool results
      const secondCallMessages = provider.chatWithRetry.mock.calls[1][0]
      const lastMessage = secondCallMessages[secondCallMessages.length - 1]
      expect(lastMessage.content).toHaveLength(2)
    })

    it('should skip tool loop when no toolRegistry', async () => {
      const agentNoTools = new AgentLoop(bus, provider, contextBuilder, storage)
      provider.chatWithRetry.mockResolvedValue({
        content: 'response',
        toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: {} }],
        stopReason: 'tool_use'
      })

      await agentNoTools._handleMessage(message)

      // Should emit the fallback message since toolCalls is truthy but no registry
      expect(bus.emit).toHaveBeenCalledWith('message:out', expect.objectContaining({
        text: "I'm having trouble completing this task. Let me try a different approach."
      }))
    })

    it('should not pass tools option when registry is empty', async () => {
      toolRegistry.getDefinitions.mockReturnValue([])
      toolRegistry.size = 0

      provider.chatWithRetry.mockResolvedValue({ content: 'ok', toolCalls: null })

      await agent._handleMessage(message)

      expect(provider.chatWithRetry).toHaveBeenCalledWith(
        expect.any(Array),
        { system: '# Identity' }
      )
    })
  })

  describe('trigger pre-processing', () => {
    let toolRegistry
    const fakeTool = {
      definition: { name: 'web_fetch' },
      execute: vi.fn().mockResolvedValue('Fetched page content')
    }

    const message = {
      text: '/fetch https://example.com',
      chatId: '123',
      userId: '456',
      channel: 'telegram'
    }

    beforeEach(() => {
      toolRegistry = {
        getDefinitions: vi.fn().mockReturnValue([]),
        matchTrigger: vi.fn().mockReturnValue(null),
        size: 0
      }

      agent = new AgentLoop(bus, provider, contextBuilder, storage, null, toolRegistry)
      vi.clearAllMocks()
    })

    it('should execute tool and enrich message when trigger matches', async () => {
      toolRegistry.matchTrigger.mockReturnValue({
        tool: fakeTool,
        input: { url: 'https://example.com' }
      })
      provider.chatWithRetry.mockResolvedValue({ content: 'Summary of the page' })

      await agent._handleMessage(message)

      expect(fakeTool.execute).toHaveBeenCalledWith(
        { url: 'https://example.com' },
        { chatId: '123', userId: '456', channel: 'telegram' }
      )
      // The last message sent to provider should contain the tool result
      const sentMessages = provider.chatWithRetry.mock.calls[0][0]
      const lastMsg = sentMessages[sentMessages.length - 1]
      expect(lastMsg.content).toContain('[web_fetch result]')
      expect(lastMsg.content).toContain('Fetched page content')
    })

    it('should include error in enriched message when trigger execution fails', async () => {
      fakeTool.execute.mockRejectedValue(new Error('DNS resolution failed'))
      toolRegistry.matchTrigger.mockReturnValue({
        tool: fakeTool,
        input: { url: 'https://bad.com' }
      })
      provider.chatWithRetry.mockResolvedValue({ content: 'Could not fetch that.' })

      await agent._handleMessage(message)

      const sentMessages = provider.chatWithRetry.mock.calls[0][0]
      const lastMsg = sentMessages[sentMessages.length - 1]
      expect(lastMsg.content).toContain('[web_fetch error]')
      expect(lastMsg.content).toContain('DNS resolution failed')
    })

    it('should not modify message when no trigger matches', async () => {
      const normalMessage = { text: 'hello', chatId: '123', userId: '456', channel: 'telegram' }
      provider.chatWithRetry.mockResolvedValue({ content: 'hi' })

      await agent._handleMessage(normalMessage)

      const sentMessages = provider.chatWithRetry.mock.calls[0][0]
      const lastMsg = sentMessages[sentMessages.length - 1]
      expect(lastMsg.content).toBe('hello')
    })
  })
})
