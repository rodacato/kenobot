import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: vi.fn() }
    }
  }
}))

// Suppress logger
vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import ClaudeAPIProvider from '../../../src/adapters/providers/claude-api.js'

describe('ClaudeAPIProvider', () => {
  let provider

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    provider = new ClaudeAPIProvider({ model: 'sonnet' })
  })

  describe('chat - text response', () => {
    it('should return content, stopReason, and null toolCalls for text-only response', async () => {
      provider.client.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 }
      })

      const result = await provider.chat([{ role: 'user', content: 'hi' }])

      expect(result.content).toBe('Hello!')
      expect(result.toolCalls).toBeNull()
      expect(result.stopReason).toBe('end_turn')
      expect(result.rawContent).toEqual([{ type: 'text', text: 'Hello!' }])
      expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 })
    })
  })

  describe('chat - tool use response', () => {
    it('should return toolCalls when response contains tool_use blocks', async () => {
      provider.client.messages.create.mockResolvedValue({
        content: [
          { type: 'text', text: "I'll fetch that." },
          { type: 'tool_use', id: 'toolu_abc', name: 'web_fetch', input: { url: 'https://example.com' } }
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 20, output_tokens: 15 }
      })

      const result = await provider.chat(
        [{ role: 'user', content: 'fetch example.com' }],
        { tools: [{ name: 'web_fetch', description: 'Fetch URL', input_schema: {} }] }
      )

      expect(result.content).toBe("I'll fetch that.")
      expect(result.toolCalls).toEqual([
        { id: 'toolu_abc', name: 'web_fetch', input: { url: 'https://example.com' } }
      ])
      expect(result.stopReason).toBe('tool_use')
    })

    it('should pass tools to API when provided', async () => {
      provider.client.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 3 }
      })

      const tools = [{ name: 'web_fetch', description: 'Fetch', input_schema: {} }]
      await provider.chat([{ role: 'user', content: 'hi' }], { tools })

      expect(provider.client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ tools })
      )
    })

    it('should not pass tools param when no tools provided', async () => {
      provider.client.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 3 }
      })

      await provider.chat([{ role: 'user', content: 'hi' }])

      const params = provider.client.messages.create.mock.calls[0][0]
      expect(params).not.toHaveProperty('tools')
    })
  })
})
