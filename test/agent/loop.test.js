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
      chat: vi.fn().mockResolvedValue({ content: 'bot response' })
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
      expect(provider.chat).toHaveBeenCalledWith(
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
      provider.chat.mockRejectedValue(new Error('API timeout'))

      await agent._handleMessage(message)

      expect(bus.emit).toHaveBeenCalledWith('message:out', {
        chatId: '123',
        text: 'Error: API timeout',
        channel: 'telegram'
      })
    })

    it('should not save session on provider failure', async () => {
      provider.chat.mockRejectedValue(new Error('API timeout'))

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
      provider.chat.mockResolvedValue({
        content: 'Got it!\n<memory>User prefers Spanish</memory>'
      })

      await agent._handleMessage(message)

      expect(memoryManager.appendDaily).toHaveBeenCalledWith('User prefers Spanish')
    })

    it('should send clean text without memory tags to user', async () => {
      provider.chat.mockResolvedValue({
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
      provider.chat.mockResolvedValue({
        content: 'Sure!\n<memory>some fact</memory>'
      })

      await agent._handleMessage(message)

      const savedMessages = storage.saveSession.mock.calls[0][1]
      expect(savedMessages[1].content).toBe('Sure!')
      expect(savedMessages[1].content).not.toContain('<memory>')
    })

    it('should handle multiple memory tags', async () => {
      provider.chat.mockResolvedValue({
        content: 'OK!\n<memory>fact one</memory>\n<memory>fact two</memory>'
      })

      await agent._handleMessage(message)

      expect(memoryManager.appendDaily).toHaveBeenCalledTimes(2)
      expect(memoryManager.appendDaily).toHaveBeenCalledWith('fact one')
      expect(memoryManager.appendDaily).toHaveBeenCalledWith('fact two')
    })

    it('should not call memoryManager when no tags present', async () => {
      provider.chat.mockResolvedValue({ content: 'plain response' })

      await agent._handleMessage(message)

      expect(memoryManager.appendDaily).not.toHaveBeenCalled()
    })

    it('should work without memoryManager (backward compatible)', async () => {
      const agentNoMemory = new AgentLoop(bus, provider, contextBuilder, storage)
      provider.chat.mockResolvedValue({
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
})
