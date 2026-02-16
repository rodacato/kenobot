import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Suppress logger
vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import CerebrasAPIProvider from '../../../src/adapters/providers/cerebras-api.js'

describe('CerebrasAPIProvider', () => {
  let provider

  beforeEach(() => {
    process.env.CEREBRAS_API_KEY = 'test-key'
    provider = new CerebrasAPIProvider({ model: '120b' })
    vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should throw if CEREBRAS_API_KEY is missing', () => {
      delete process.env.CEREBRAS_API_KEY
      expect(() => new CerebrasAPIProvider({ model: '120b' }))
        .toThrow('CEREBRAS_API_KEY environment variable is required')
    })

    it('should map friendly model name to API model ID', () => {
      expect(provider.model).toBe('gpt-oss-120b')
    })

    it('should map 8b to llama3.1-8b', () => {
      const p = new CerebrasAPIProvider({ model: '8b' })
      expect(p.model).toBe('llama3.1-8b')
    })

    it('should map qwen to full model ID', () => {
      const p = new CerebrasAPIProvider({ model: 'qwen' })
      expect(p.model).toBe('qwen-3-235b-a22b-instruct-2507')
    })

    it('should pass through unknown model names as-is', () => {
      const p = new CerebrasAPIProvider({ model: 'some-future-model' })
      expect(p.model).toBe('some-future-model')
    })

    it('should default to gpt-oss-120b when no model specified', () => {
      const p = new CerebrasAPIProvider({})
      expect(p.model).toBe('gpt-oss-120b')
    })
  })

  describe('chat - text response', () => {
    it('should return content, stopReason, and null toolCalls for text-only response', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      })

      const result = await provider.chat([{ role: 'user', content: 'hi' }])

      expect(result.content).toBe('Hello!')
      expect(result.toolCalls).toBeNull()
      expect(result.stopReason).toBe('end_turn')
      expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 })
    })

    it('should pass system prompt as system message', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 }
        })
      })

      await provider.chat(
        [{ role: 'user', content: 'hi' }],
        { system: 'You are a helpful bot.' }
      )

      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful bot.' })
      expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' })
    })

    it('should pass max_tokens as max_completion_tokens', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 }
        })
      })

      await provider.chat([{ role: 'user', content: 'hi' }], { max_tokens: 8192 })

      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body.max_completion_tokens).toBe(8192)
    })

    it('should pass temperature when provided', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 }
        })
      })

      await provider.chat([{ role: 'user', content: 'hi' }], { temperature: 0.7 })

      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body.temperature).toBe(0.7)
    })
  })

  describe('chat - tool use response', () => {
    it('should return toolCalls when response contains tool_calls', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: "I'll fetch that.",
              tool_calls: [{
                id: 'call_abc',
                type: 'function',
                function: { name: 'web_fetch', arguments: '{"url":"https://example.com"}' }
              }]
            },
            finish_reason: 'tool_calls'
          }],
          usage: { prompt_tokens: 20, completion_tokens: 15 }
        })
      })

      const result = await provider.chat(
        [{ role: 'user', content: 'fetch example.com' }],
        { tools: [{ type: 'function', function: { name: 'web_fetch' } }] }
      )

      expect(result.content).toBe("I'll fetch that.")
      expect(result.toolCalls).toEqual([
        { id: 'call_abc', name: 'web_fetch', input: { url: 'https://example.com' } }
      ])
      expect(result.stopReason).toBe('tool_use')
    })

    it('should pass tools to API when provided', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 }
        })
      })

      const tools = [{ type: 'function', function: { name: 'web_fetch', description: 'Fetch URL' } }]
      await provider.chat([{ role: 'user', content: 'hi' }], { tools })

      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body.tools).toEqual(tools)
    })

    it('should not pass tools param when no tools provided', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3 }
        })
      })

      await provider.chat([{ role: 'user', content: 'hi' }])

      const body = JSON.parse(fetch.mock.calls[0][1].body)
      expect(body).not.toHaveProperty('tools')
    })
  })

  describe('chat - error handling', () => {
    it('should throw with status on HTTP error', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limit exceeded'
      })

      try {
        await provider.chat([{ role: 'user', content: 'test' }])
        expect.unreachable()
      } catch (error) {
        expect(error.message).toContain('Cerebras API error')
        expect(error.status).toBe(429)
      }
    })

    it('should wrap network errors', async () => {
      fetch.mockRejectedValue(new Error('network failure'))

      await expect(
        provider.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Cerebras API error: network failure')
    })
  })

  describe('chat - finish_reason mapping', () => {
    it('should map "length" to "max_tokens"', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'truncated' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 5, completion_tokens: 100 }
        })
      })

      const result = await provider.chat([{ role: 'user', content: 'hi' }])
      expect(result.stopReason).toBe('max_tokens')
    })
  })

  describe('_convertMessages()', () => {
    it('should pass through plain messages', () => {
      const result = provider._convertMessages([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ])

      expect(result).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ])
    })

    it('should prepend system message when system prompt given', () => {
      const result = provider._convertMessages(
        [{ role: 'user', content: 'hello' }],
        'You are helpful.'
      )

      expect(result[0]).toEqual({ role: 'system', content: 'You are helpful.' })
      expect(result[1]).toEqual({ role: 'user', content: 'hello' })
    })

    it('should pass through OpenAI tool messages from buildToolResultMessages', () => {
      const result = provider._convertMessages([
        { role: 'tool', content: 'result data', tool_call_id: 'call_123' }
      ])

      expect(result).toEqual([
        { role: 'tool', content: 'result data', tool_call_id: 'call_123' }
      ])
    })

    it('should pass through assistant messages with tool_calls', () => {
      const msg = {
        role: 'assistant',
        content: 'Using tool',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'test', arguments: '{}' } }]
      }
      const result = provider._convertMessages([msg])

      expect(result[0]).toBe(msg)
    })

    it('should convert Anthropic-style tool_result arrays to tool messages', () => {
      const result = provider._convertMessages([
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_abc', content: 'Tool output' }
          ]
        }
      ])

      expect(result).toEqual([
        { role: 'tool', content: 'Tool output', tool_call_id: 'toolu_abc' }
      ])
    })

    it('should extract text from Anthropic-style text array content', () => {
      const result = provider._convertMessages([
        { role: 'assistant', content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'World' }] }
      ])

      expect(result).toEqual([
        { role: 'assistant', content: 'Hello\nWorld' }
      ])
    })
  })

  describe('adaptToolDefinitions()', () => {
    it('should convert Anthropic format to OpenAI function format', () => {
      const anthropicTools = [
        {
          name: 'web_fetch',
          description: 'Fetch a URL',
          input_schema: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url']
          }
        }
      ]

      const result = provider.adaptToolDefinitions(anthropicTools)

      expect(result).toEqual([{
        type: 'function',
        function: {
          name: 'web_fetch',
          description: 'Fetch a URL',
          parameters: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url']
          }
        }
      }])
    })
  })

  describe('buildToolResultMessages()', () => {
    it('should build OpenAI-format tool result messages', () => {
      const rawContent = {
        content: 'Let me check.',
        tool_calls: [{
          id: 'call_123',
          type: 'function',
          function: { name: 'web_fetch', arguments: '{"url":"https://example.com"}' }
        }]
      }

      const results = [
        { id: 'call_123', result: '<html>Example</html>', isError: false }
      ]

      const messages = provider.buildToolResultMessages(rawContent, results)

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual({
        role: 'assistant',
        content: 'Let me check.',
        tool_calls: rawContent.tool_calls
      })
      expect(messages[1]).toEqual({
        role: 'tool',
        content: '<html>Example</html>',
        tool_call_id: 'call_123'
      })
    })

    it('should handle multiple tool results', () => {
      const rawContent = {
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'a', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'b', arguments: '{}' } }
        ]
      }

      const results = [
        { id: 'call_1', result: 'result1', isError: false },
        { id: 'call_2', result: 'result2', isError: false }
      ]

      const messages = provider.buildToolResultMessages(rawContent, results)

      expect(messages).toHaveLength(3)
      expect(messages[1].tool_call_id).toBe('call_1')
      expect(messages[2].tool_call_id).toBe('call_2')
    })
  })

  describe('supportsTools', () => {
    it('should return true', () => {
      expect(provider.supportsTools).toBe(true)
    })
  })

  describe('name', () => {
    it('should return cerebras-api', () => {
      expect(provider.name).toBe('cerebras-api')
    })
  })
})
