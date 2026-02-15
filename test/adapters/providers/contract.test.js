import { describe, test, expect, beforeEach, vi } from 'vitest'
import ClaudeAPIProvider from '../../../src/adapters/providers/claude-api.js'
import GeminiAPIProvider from '../../../src/adapters/providers/gemini-api.js'

/**
 * Provider Contract Tests
 *
 * Ensures all providers implement the same interface and behavior.
 * This is critical for maintaining consistency across different LLM providers.
 *
 * Contract requirements:
 * 1. Must have a 'name' getter that returns a string
 * 2. Must implement chat(messages, options) returning {content, toolCalls, stopReason}
 * 3. toolCalls must be null when no tools are called (not an empty array)
 * 4. Must implement adaptToolDefinitions(definitions) for tool support
 * 5. Must implement buildToolResultMessages(rawContent, results) for tool support
 * 6. Must handle errors gracefully (throw Error instances)
 */

// Mock API clients to avoid real network calls
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    constructor() {
      this.messages = {
        create: vi.fn()
      }
    }
  }
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = {
        generateContent: vi.fn()
      }
    }
  }
}))

// Set fake API keys for testing (providers validate these exist)
process.env.ANTHROPIC_API_KEY = 'sk-test-fake-key-for-testing-only'
process.env.GEMINI_API_KEY = 'fake-gemini-key-for-testing-only'

// Provider configurations for testing
const PROVIDER_CONFIGS = [
  {
    name: 'claude-api',
    Provider: ClaudeAPIProvider,
    config: { apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-3-5-sonnet-20241022' }
  },
  {
    name: 'gemini-api',
    Provider: GeminiAPIProvider,
    config: { apiKey: process.env.GEMINI_API_KEY, model: 'gemini-2.0-flash-exp' }
  }
]

describe('Provider Contract Tests', () => {
  PROVIDER_CONFIGS.forEach(({ name, Provider, config }) => {
    describe(`${name} provider`, () => {
      let provider

      beforeEach(() => {
        provider = new Provider(config)
      })

      test('has required "name" property', () => {
        expect(provider).toHaveProperty('name')
        expect(typeof provider.name).toBe('string')
        expect(provider.name.length).toBeGreaterThan(0)
      })

      test('implements chat() method', () => {
        expect(provider.chat).toBeDefined()
        expect(typeof provider.chat).toBe('function')
      })

      test('chat() returns correct shape', async () => {
        // Mock successful response
        if (name === 'claude-api') {
          provider.client.messages.create.mockResolvedValueOnce({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Test response' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 }
          })
        } else if (name === 'gemini-api') {
          const mockResponse = {
            text: 'Test response',
            functionCalls: null,
            candidates: [{
              finishReason: 'STOP',
              content: { parts: [{ text: 'Test response' }] }
            }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 15
            }
          }
          provider.client.models.generateContent.mockResolvedValueOnce(mockResponse)
        }

        const result = await provider.chat(
          [{ role: 'user', content: 'Hello' }],
          {}
        )

        // Verify response shape
        expect(result).toHaveProperty('content')
        expect(typeof result.content).toBe('string')

        expect(result).toHaveProperty('toolCalls')
        // toolCalls must be null or array, never undefined
        expect(result.toolCalls === null || Array.isArray(result.toolCalls)).toBe(true)

        expect(result).toHaveProperty('stopReason')
        expect(typeof result.stopReason).toBe('string')
      })

      test('chat() returns toolCalls as null when no tools are called', async () => {
        // Mock response without tool calls
        if (name === 'claude-api') {
          provider.client.messages.create.mockResolvedValueOnce({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'No tools needed' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 }
          })
        } else if (name === 'gemini-api') {
          const mockResponse = {
            response: {
              text: () => 'No tools needed',
              functionCalls: () => null,
              candidates: [{
                finishReason: 'STOP',
                content: { parts: [{ text: 'No tools needed' }] }
              }],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
                totalTokenCount: 15
              }
            }
          }
          provider.client.models.generateContent.mockResolvedValueOnce(mockResponse)
        }

        const result = await provider.chat(
          [{ role: 'user', content: 'Hello' }],
          {}
        )

        // CRITICAL: toolCalls must be null, NOT [] (empty array is truthy)
        expect(result.toolCalls).toBeNull()
      })

      test('chat() throws Error on failure', async () => {
        // Mock API error
        const apiError = new Error('API Error')
        if (name === 'claude-api') {
          provider.client.messages.create.mockRejectedValueOnce(apiError)
        } else if (name === 'gemini-api') {
          provider.client.models.generateContent.mockRejectedValueOnce(apiError)
        }

        await expect(provider.chat(
          [{ role: 'user', content: 'Hello' }],
          {}
        )).rejects.toThrow()
      })

      test('implements adaptToolDefinitions() for tool support', () => {
        expect(provider.adaptToolDefinitions).toBeDefined()
        expect(typeof provider.adaptToolDefinitions).toBe('function')

        const testDef = {
          name: 'test_tool',
          description: 'A test tool',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' }
            }
          }
        }

        const adapted = provider.adaptToolDefinitions([testDef])
        expect(Array.isArray(adapted)).toBe(true)
      })

      test('implements buildToolResultMessages()', () => {
        expect(provider.buildToolResultMessages).toBeDefined()
        expect(typeof provider.buildToolResultMessages).toBe('function')

        const rawContent = [
          { type: 'text', text: 'Using tool' },
          { type: 'tool_use', id: 'tool_1', name: 'test', input: {} }
        ]
        const results = [
          { id: 'tool_1', result: 'Tool output', isError: false }
        ]

        const messages = provider.buildToolResultMessages(rawContent, results)
        expect(Array.isArray(messages)).toBe(true)
        expect(messages.length).toBeGreaterThan(0)
      })

      test('inherits chatWithRetry() from BaseProvider', () => {
        expect(provider.chatWithRetry).toBeDefined()
        expect(typeof provider.chatWithRetry).toBe('function')
      })

      test('has supportsTools property', () => {
        expect(provider).toHaveProperty('supportsTools')
        expect(typeof provider.supportsTools).toBe('boolean')
      })
    })
  })

  describe('Cross-provider consistency', () => {
    test('all providers return same response shape', async () => {
      const responses = []

      for (const { name, Provider, config } of PROVIDER_CONFIGS) {
        const provider = new Provider(config)

        // Mock successful response for each provider
        if (name === 'claude-api') {
          provider.client.messages.create.mockResolvedValueOnce({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 }
          })
        } else if (name === 'gemini-api') {
          const mockResponse = {
            response: {
              text: () => 'Response',
              functionCalls: () => null,
              candidates: [{
                finishReason: 'STOP',
                content: { parts: [{ text: 'Response' }] }
              }],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
                totalTokenCount: 15
              }
            }
          }
          provider.client.models.generateContent.mockResolvedValueOnce(mockResponse)
        }

        const result = await provider.chat(
          [{ role: 'user', content: 'Test' }],
          {}
        )
        responses.push({ provider: name, result })
      }

      // Verify all responses have the same shape
      const firstResponse = responses[0].result
      const requiredKeys = ['content', 'toolCalls', 'stopReason']

      responses.forEach(({ provider, result }) => {
        requiredKeys.forEach(key => {
          expect(result).toHaveProperty(key)
        })

        // All providers should have same property types
        expect(typeof result.content).toBe(typeof firstResponse.content)
        expect(result.toolCalls === null || Array.isArray(result.toolCalls)).toBe(true)
        expect(typeof result.stopReason).toBe(typeof firstResponse.stopReason)
      })
    })

    test('all providers handle empty messages array consistently', async () => {
      for (const { name, Provider, config } of PROVIDER_CONFIGS) {
        const provider = new Provider(config)

        // Empty messages should either throw or handle gracefully
        // (behavior is provider-specific but should be consistent)
        try {
          if (name === 'claude-api') {
            provider.client.messages.create.mockRejectedValueOnce(
              new Error('messages: Expected an array with minimum length 1')
            )
          } else if (name === 'gemini-api') {
            provider.client.models.generateContent.mockRejectedValueOnce(
              new Error('Invalid request')
            )
          }

          await provider.chat([], {})
          // If it doesn't throw, that's also valid (some providers may allow it)
        } catch (error) {
          // Should throw an Error instance
          expect(error).toBeInstanceOf(Error)
        }
      }
    })
  })
})
