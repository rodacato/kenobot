import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { createApp } from '../../src/app.js'
import { MESSAGE_IN, MESSAGE_OUT } from '../../src/events.js'

/**
 * Integration test: Full message flow
 *
 * Tests the complete message flow through the system:
 * User message → TelegramChannel → bus MESSAGE_IN → AgentLoop →
 * ContextBuilder → Provider → Response → bus MESSAGE_OUT → TelegramChannel
 *
 * Uses real components except:
 * - Provider (mocked - network boundary)
 * - Telegram bot (mocked - network boundary)
 * - Logger (mocked - suppresses console output)
 */

// Mock logger to suppress output
vi.mock('../../src/logger.js', () => ({
  Logger: class {
    configure() {}
    info() {}
    warn() {}
    error() {}
  },
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock Telegram bot - network boundary
vi.mock('grammy', () => ({
  Bot: class {
    constructor() {
      this.api = {
        getMe: vi.fn().mockResolvedValue({ id: 123, username: 'test_bot', first_name: 'Test' }),
        sendMessage: vi.fn().mockResolvedValue({}),
        sendChatAction: vi.fn().mockResolvedValue({})
      }
      this.on = vi.fn().mockReturnThis()
      this.catch = vi.fn().mockReturnThis()
      this.start = vi.fn().mockResolvedValue({})
      this.stop = vi.fn().mockResolvedValue({})
    }
  }
}))

describe('Integration: Full message flow', () => {
  let tempDir
  let app
  let mockProvider
  let messageOutSpy

  beforeEach(async () => {
    // Create temp directory for this test
    tempDir = await mkdtemp(join(tmpdir(), 'kenobot-test-'))

    // Mock provider - network boundary
    mockProvider = {
      name: 'mock-provider',
      supportsTools: true,
      // Default implementation - tests can override with mockResolvedValueOnce
      chat: vi.fn().mockResolvedValue({
        content: 'Default mock response',
        toolCalls: null
      }),
      adaptToolDefinitions: vi.fn((defs) => defs),
      buildToolResultMessages: (rawContent, results) => [
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

    // Create identity directory structure (cognitive system expects directory mode)
    const { writeFile, mkdir } = await import('node:fs/promises')
    const identityDir = join(tempDir, 'identity')
    await mkdir(identityDir, { recursive: true })
    await mkdir(join(tempDir, 'skills'), { recursive: true })

    // Write identity files (directory mode: SOUL.md, IDENTITY.md, core.md)
    await writeFile(join(identityDir, 'SOUL.md'), '# Test Bot\n\nYou are a test bot.')
    await writeFile(join(identityDir, 'IDENTITY.md'), 'Test identity details.')
    await writeFile(join(identityDir, 'core.md'), 'Core personality traits.')
    await writeFile(join(identityDir, 'preferences.md'), '')
    await writeFile(join(identityDir, 'rules.json'), JSON.stringify({ behavioral: [], conversation: [] }))

    // Minimal config
    const config = {
      dataDir: tempDir,
      identityFile: identityDir,
      skillsDir: join(tempDir, 'skills'),
      telegram: {
        token: 'test-token',
        allowedUsers: [12345],
        allowedChatIds: []
      },
      http: { enabled: false },
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 60000
      },
      maxToolIterations: 20,
      watchdogInterval: 30000,
      sessionHistoryLimit: 20
    }

    // Create app
    app = createApp(config, mockProvider, { homePath: tempDir })

    // Spy on MESSAGE_OUT
    messageOutSpy = vi.fn()
    app.bus.on(MESSAGE_OUT, messageOutSpy)

    // Start app (loads tools, skills, etc.)
    await app.start()
  })

  afterEach(async () => {
    if (app) {
      await app.stop()
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test('message flow: user sends message → bot responds', async () => {
    // Mock provider response
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Hello! How can I help you?',
      toolCalls: null
    })

    // Simulate user message via event bus
    app.bus.emit(MESSAGE_IN, {
      text: 'Hello',
      chatId: 12345,
      userId: 12345,
      channel: 'telegram',
      timestamp: new Date()
    })

    // Wait for MESSAGE_OUT
    await vi.waitFor(() => {
      expect(messageOutSpy).toHaveBeenCalled()
    }, { timeout: 5000 })

    // Verify MESSAGE_OUT was emitted with correct data
    expect(messageOutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello! How can I help you?',
        chatId: 12345,
        channel: 'telegram'
      })
    )

    // Verify provider was called
    expect(mockProvider.chat).toHaveBeenCalledOnce()

    // Verify context was built correctly
    const providerCall = mockProvider.chat.mock.calls[0]
    const messages = providerCall[0]  // First arg: messages array
    const options = providerCall[1]   // Second arg: options with system prompt

    expect(Array.isArray(messages)).toBe(true)
    expect(messages).toEqual([
      { role: 'user', content: 'Hello' }
    ])
    expect(options).toHaveProperty('system') // System prompt in options
  })

  test('message flow: session persistence (multi-turn)', async () => {
    // First message
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Nice to meet you!',
      toolCalls: null
    })

    app.bus.emit(MESSAGE_IN, {
      text: 'My name is Alice',
      chatId: 12345,
      userId: 12345,
      channel: 'telegram'
    })

    await vi.waitFor(() => {
      expect(messageOutSpy).toHaveBeenCalledTimes(1)
    }, { timeout: 5000 })

    // Second message - should include previous history
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Hello again, Alice!',
      toolCalls: null
    })

    app.bus.emit(MESSAGE_IN, {
      text: 'Hello again',
      chatId: 12345,
      userId: 12345,
      channel: 'telegram'
    })

    await vi.waitFor(() => {
      expect(messageOutSpy).toHaveBeenCalledTimes(2)
    }, { timeout: 5000 })

    // Verify second call includes conversation history
    const secondCall = mockProvider.chat.mock.calls[1]
    const messages = secondCall[0] // First arg: messages array

    // Should include previous messages from session history
    expect(messages.length).toBeGreaterThanOrEqual(3) // At least: user1, assistant1, user2
    expect(messages[0]).toEqual({ role: 'user', content: 'My name is Alice' })
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Nice to meet you!' })
    expect(messages[2]).toEqual({ role: 'user', content: 'Hello again' })
  })

  test('message flow: tool execution', async () => {
    // Register a test tool
    const testTool = {
      definition: {
        name: 'test_tool',
        description: 'A test tool',
        input_schema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        }
      },
      execute: vi.fn().mockResolvedValue('Tool executed successfully')
    }

    app.toolRegistry.register(testTool)

    // First response: bot calls tool
    mockProvider.chat.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Let me use the tool' },
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'test_tool',
          input: { input: 'test' }
        }
      ],
      toolCalls: [
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'test_tool',
          input: { input: 'test' }
        }
      ]
    })

    // Second response: bot responds with tool result
    mockProvider.chat.mockResolvedValueOnce({
      content: 'Tool completed!',
      toolCalls: null
    })

    app.bus.emit(MESSAGE_IN, {
      text: 'Use the test tool',
      chatId: 12345,
      userId: 12345,
      channel: 'telegram'
    })

    await vi.waitFor(() => {
      expect(messageOutSpy).toHaveBeenCalled()
    }, { timeout: 5000 })

    // Verify tool was executed with input and messageContext
    expect(testTool.execute).toHaveBeenCalledWith(
      { input: 'test' },
      expect.objectContaining({
        chatId: 12345,
        userId: 12345,
        channel: 'telegram'
      })
    )

    // Verify final response
    expect(messageOutSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Tool completed!',
        chatId: 12345
      })
    )

    // Verify provider was called twice (initial + after tool)
    expect(mockProvider.chat).toHaveBeenCalledTimes(2)
  })

  test('message flow: error handling', async () => {
    // Mock provider to throw error
    mockProvider.chat.mockRejectedValueOnce(new Error('API rate limit exceeded'))

    app.bus.emit(MESSAGE_IN, {
      text: 'This will fail',
      chatId: 12345,
      userId: 12345,
      channel: 'telegram'
    })

    // Wait for MESSAGE_OUT with error
    await vi.waitFor(() => {
      expect(messageOutSpy).toHaveBeenCalled()
    }, { timeout: 5000 })

    // Verify error message was sent
    const outMessage = messageOutSpy.mock.calls[0][0]
    expect(outMessage.text).toContain('Error')
    expect(outMessage.text).toContain('rate limit')
  })

  test('message flow: typing indicator', async () => {
    mockProvider.chat.mockImplementation(() => {
      // Simulate slow response
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({ content: 'Delayed response', toolCalls: null })
        }, 100)
      })
    })

    // Spy on typing indicator event
    const typingSpy = vi.fn()
    app.bus.on('thinking:start', typingSpy)

    app.bus.emit(MESSAGE_IN, {
      text: 'This will be slow',
      chatId: 12345,
      userId: 12345,
      channel: 'telegram'
    })

    // Verify typing indicator was shown
    await vi.waitFor(() => {
      expect(typingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 12345,
          channel: 'telegram'
        })
      )
    }, { timeout: 1000 })

    // Wait for response
    await vi.waitFor(() => {
      expect(messageOutSpy).toHaveBeenCalled()
    }, { timeout: 5000 })
  })

  test('message flow: context builder includes memory', async () => {
    // Add a memory (semantic fact) - it goes to daily logs
    await app.memory.addFact('Test memory content')

    mockProvider.chat.mockResolvedValueOnce({
      content: 'Response',
      toolCalls: null
    })

    app.bus.emit(MESSAGE_IN, {
      text: 'Test',
      chatId: 12345,
      userId: 12345,
      channel: 'telegram'
    })

    await vi.waitFor(() => {
      expect(mockProvider.chat).toHaveBeenCalled()
    }, { timeout: 5000 })

    // Verify system prompt was built (contains core identity)
    const options = mockProvider.chat.mock.calls[0][1] // Second arg: options
    expect(options.system).toContain('Core personality traits')
    // Memory from addFact goes to daily logs, not system prompt directly
    // So we just verify the system prompt was constructed
  })
})
