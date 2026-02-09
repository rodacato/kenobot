import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Google GenAI SDK
const mockGenerateContent = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor() {
      this.models = { generateContent: mockGenerateContent }
    }
  }
}))

// Suppress logger
vi.mock('../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import GeminiAPIProvider from '../../src/providers/gemini-api.js'

describe('GeminiAPIProvider', () => {
  let provider

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    provider = new GeminiAPIProvider({ model: 'flash' })
    mockGenerateContent.mockReset()
  })

  describe('constructor', () => {
    it('should throw if GEMINI_API_KEY is missing', () => {
      delete process.env.GEMINI_API_KEY
      expect(() => new GeminiAPIProvider({ model: 'flash' }))
        .toThrow('GEMINI_API_KEY environment variable is required')
    })

    it('should map friendly model name to API model ID', () => {
      expect(provider.model).toBe('gemini-2.5-flash')
    })

    it('should pass through unknown model names as-is', () => {
      const p = new GeminiAPIProvider({ model: 'gemini-3-pro-preview' })
      expect(p.model).toBe('gemini-3-pro-preview')
    })
  })

  describe('chat - text response', () => {
    it('should return content, stopReason, and null toolCalls for text-only response', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'Hello!',
        functionCalls: null,
        candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'Hello!' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
      })

      const result = await provider.chat([{ role: 'user', content: 'hi' }])

      expect(result.content).toBe('Hello!')
      expect(result.toolCalls).toBeNull()
      expect(result.stopReason).toBe('end_turn')
      expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 })
    })

    it('should pass system prompt in config.systemInstruction', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'ok',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 }
      })

      await provider.chat(
        [{ role: 'user', content: 'hi' }],
        { system: 'You are a helpful bot.' }
      )

      const params = mockGenerateContent.mock.calls[0][0]
      expect(params.config.systemInstruction).toBe('You are a helpful bot.')
    })
  })

  describe('chat - function call response', () => {
    it('should return toolCalls with synthetic IDs when response has function calls', async () => {
      mockGenerateContent.mockResolvedValue({
        text: "I'll check that.",
        functionCalls: [
          { name: 'web_fetch', args: { url: 'https://example.com' } }
        ],
        candidates: [{
          finishReason: 'STOP',
          content: {
            role: 'model',
            parts: [
              { text: "I'll check that." },
              { functionCall: { name: 'web_fetch', args: { url: 'https://example.com' } } }
            ]
          }
        }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15 }
      })

      const result = await provider.chat(
        [{ role: 'user', content: 'fetch example.com' }],
        { tools: [{ functionDeclarations: [{ name: 'web_fetch' }] }] }
      )

      expect(result.toolCalls).toEqual([
        { id: 'gemini_call_0', name: 'web_fetch', input: { url: 'https://example.com' } }
      ])
      expect(result.content).toBe("I'll check that.")
    })

    it('should pass tools to API when provided', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'ok',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 }
      })

      const tools = [{ functionDeclarations: [{ name: 'web_fetch' }] }]
      await provider.chat([{ role: 'user', content: 'hi' }], { tools })

      const params = mockGenerateContent.mock.calls[0][0]
      expect(params.config.tools).toEqual(tools)
    })

    it('should not pass tools when not provided', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'ok',
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 }
      })

      await provider.chat([{ role: 'user', content: 'hi' }])

      const params = mockGenerateContent.mock.calls[0][0]
      expect(params.config).not.toHaveProperty('tools')
    })
  })

  describe('chat - error handling', () => {
    it('should wrap errors with provider prefix', async () => {
      mockGenerateContent.mockRejectedValue(new Error('rate limit exceeded'))

      await expect(
        provider.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Gemini API error: rate limit exceeded')
    })

    it('should preserve HTTP status on errors', async () => {
      const apiError = new Error('too many requests')
      apiError.status = 429
      mockGenerateContent.mockRejectedValue(apiError)

      try {
        await provider.chat([{ role: 'user', content: 'test' }])
      } catch (error) {
        expect(error.status).toBe(429)
      }
    })
  })

  describe('_convertMessages()', () => {
    it('should convert assistant role to model', () => {
      const result = provider._convertMessages([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ])

      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'hi there' }] }
      ])
    })

    it('should pass through messages already in parts format', () => {
      const msg = { role: 'model', parts: [{ functionCall: { name: 'test', args: {} } }] }
      const result = provider._convertMessages([msg])

      expect(result[0].parts).toEqual([{ functionCall: { name: 'test', args: {} } }])
    })
  })

  describe('adaptToolDefinitions()', () => {
    it('should convert Anthropic format to Gemini functionDeclarations', () => {
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
        functionDeclarations: [{
          name: 'web_fetch',
          description: 'Fetch a URL',
          parameters: {
            type: 'object',
            properties: { url: { type: 'string' } },
            required: ['url']
          }
        }]
      }])
    })
  })

  describe('buildToolResultMessages()', () => {
    it('should build Gemini-format tool result messages', () => {
      const rawContent = {
        parts: [
          { text: 'Let me check.' },
          { functionCall: { name: 'web_fetch', args: { url: 'https://example.com' } } }
        ]
      }

      const results = [
        { id: 'gemini_call_0', result: '<html>Example</html>', isError: false }
      ]

      const messages = provider.buildToolResultMessages(rawContent, results)

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual({ role: 'model', parts: rawContent.parts })
      expect(messages[1]).toEqual({
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'web_fetch',
            response: { result: '<html>Example</html>' }
          }
        }]
      })
    })
  })

  describe('supportsTools', () => {
    it('should return true', () => {
      expect(provider.supportsTools).toBe(true)
    })
  })

  describe('name', () => {
    it('should return gemini-api', () => {
      expect(provider.name).toBe('gemini-api')
    })
  })
})
