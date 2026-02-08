import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../../src/logger.js'
import ToolOrchestrator from '../../src/agent/tool-orchestrator.js'

describe('ToolOrchestrator', () => {
  let orchestrator
  let toolRegistry
  let provider

  beforeEach(() => {
    toolRegistry = {
      execute: vi.fn().mockResolvedValue('tool result')
    }

    provider = {
      chatWithRetry: vi.fn().mockResolvedValue({
        content: 'final response',
        toolCalls: null,
        stopReason: 'end_turn'
      }),
      buildToolResultMessages: vi.fn((rawContent, results) => [
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
      ])
    }

    orchestrator = new ToolOrchestrator(toolRegistry, provider, { maxIterations: 5 })
    vi.clearAllMocks()
  })

  it('should execute tool calls and return final response', async () => {
    const initialResponse = {
      content: 'Let me fetch that.',
      toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: { url: 'https://example.com' } }],
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: { url: 'https://example.com' } }]
    }

    const messages = [{ role: 'user', content: 'fetch this' }]
    const chatOptions = { system: 'identity' }
    const messageContext = { chatId: '123', userId: '456', channel: 'telegram' }

    const { response, iterations } = await orchestrator.executeLoop(
      initialResponse, messages, chatOptions, messageContext, 'telegram-123'
    )

    expect(response.content).toBe('final response')
    expect(iterations).toBe(1)
    expect(toolRegistry.execute).toHaveBeenCalledWith('web_fetch', { url: 'https://example.com' }, messageContext)
  })

  it('should handle multiple iterations', async () => {
    provider.chatWithRetry
      .mockResolvedValueOnce({
        content: 'intermediate',
        toolCalls: [{ id: 'toolu_2', name: 'echo', input: { text: 'again' } }],
        stopReason: 'tool_use',
        rawContent: [{ type: 'tool_use', id: 'toolu_2', name: 'echo', input: { text: 'again' } }]
      })
      .mockResolvedValueOnce({
        content: 'done',
        toolCalls: null,
        stopReason: 'end_turn'
      })

    const initialResponse = {
      content: 'start',
      toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: {} }],
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: {} }]
    }

    const { response, iterations } = await orchestrator.executeLoop(
      initialResponse, [], {}, {}, 'test'
    )

    expect(response.content).toBe('done')
    expect(iterations).toBe(2)
    expect(toolRegistry.execute).toHaveBeenCalledTimes(2)
  })

  it('should stop at max iterations with fallback message', async () => {
    orchestrator.maxIterations = 2

    // Always return tool calls
    provider.chatWithRetry.mockResolvedValue({
      content: 'still going',
      toolCalls: [{ id: 'toolu_x', name: 'loop', input: {} }],
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'toolu_x', name: 'loop', input: {} }]
    })

    const initialResponse = {
      content: 'start',
      toolCalls: [{ id: 'toolu_1', name: 'loop', input: {} }],
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'toolu_1', name: 'loop', input: {} }]
    }

    const { response, iterations } = await orchestrator.executeLoop(
      initialResponse, [], {}, {}, 'test'
    )

    expect(iterations).toBe(2)
    expect(response.content).toContain('trouble completing')
    expect(logger.warn).toHaveBeenCalledWith('agent', 'max_iterations_exceeded', expect.any(Object))
  })

  it('should handle tool execution errors gracefully', async () => {
    toolRegistry.execute.mockRejectedValue(new Error('Network timeout'))

    const initialResponse = {
      content: 'Fetching...',
      toolCalls: [{ id: 'toolu_1', name: 'web_fetch', input: { url: 'https://bad.com' } }],
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: {} }]
    }

    const { response } = await orchestrator.executeLoop(
      initialResponse, [], {}, {}, 'test'
    )

    // Should pass error to provider as tool_result
    expect(provider.buildToolResultMessages).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ result: 'Error: Network timeout', isError: true })]
    )
    expect(response.content).toBe('final response')
  })

  it('should execute parallel tool calls', async () => {
    const initialResponse = {
      content: 'Fetching both.',
      toolCalls: [
        { id: 'toolu_1', name: 'web_fetch', input: { url: 'https://a.com' } },
        { id: 'toolu_2', name: 'web_fetch', input: { url: 'https://b.com' } }
      ],
      stopReason: 'tool_use',
      rawContent: [
        { type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: { url: 'https://a.com' } },
        { type: 'tool_use', id: 'toolu_2', name: 'web_fetch', input: { url: 'https://b.com' } }
      ]
    }

    await orchestrator.executeLoop(initialResponse, [], {}, {}, 'test')

    expect(toolRegistry.execute).toHaveBeenCalledTimes(2)
    expect(provider.buildToolResultMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ id: 'toolu_1' }),
        expect.objectContaining({ id: 'toolu_2' })
      ])
    )
  })

  it('should append tool messages to the messages array', async () => {
    const messages = [{ role: 'user', content: 'hello' }]

    const initialResponse = {
      content: 'Using tool.',
      toolCalls: [{ id: 'toolu_1', name: 'echo', input: {} }],
      stopReason: 'tool_use',
      rawContent: [{ type: 'tool_use', id: 'toolu_1', name: 'echo', input: {} }]
    }

    await orchestrator.executeLoop(initialResponse, messages, {}, {}, 'test')

    // Messages array should be mutated with tool result messages
    expect(messages.length).toBeGreaterThan(1)
  })

  it('should return 0 iterations when no tool calls', async () => {
    const noToolResponse = {
      content: 'plain text',
      toolCalls: null,
      stopReason: 'end_turn'
    }

    const { response, iterations } = await orchestrator.executeLoop(
      noToolResponse, [], {}, {}, 'test'
    )

    expect(iterations).toBe(0)
    expect(response.content).toBe('plain text')
    expect(toolRegistry.execute).not.toHaveBeenCalled()
  })
})
