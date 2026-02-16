import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the Google GenAI SDK
const mockEmbedContent = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    constructor() {
      this.models = { embedContent: mockEmbedContent }
    }
  }
}))

// Suppress logger
vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import GeminiEmbeddingProvider from '../../../src/adapters/embeddings/gemini-embedding.js'
import { createEmbeddingProvider } from '../../../src/adapters/embeddings/registry.js'

describe('GeminiEmbeddingProvider', () => {
  let provider

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    provider = new GeminiEmbeddingProvider({ embedding: { dimensions: 768 } })
    mockEmbedContent.mockReset()
  })

  afterEach(() => {
    delete process.env.GEMINI_API_KEY
  })

  describe('constructor', () => {
    it('should throw if GEMINI_API_KEY is missing', () => {
      delete process.env.GEMINI_API_KEY
      expect(() => new GeminiEmbeddingProvider({}))
        .toThrow('GEMINI_API_KEY environment variable is required')
    })

    it('should use default model and dimensions', () => {
      const p = new GeminiEmbeddingProvider({})
      expect(p.model).toBe('gemini-embedding-001')
      expect(p.dimensions).toBe(768)
    })

    it('should accept custom model and dimensions from config', () => {
      const p = new GeminiEmbeddingProvider({
        embedding: { model: 'gemini-embedding-exp-03-07', dimensions: 256 }
      })
      expect(p.model).toBe('gemini-embedding-exp-03-07')
      expect(p.dimensions).toBe(256)
    })
  })

  describe('embed - single text', () => {
    it('should return a single-element array of vectors', async () => {
      mockEmbedContent.mockResolvedValue({
        embedding: { values: [0.1, 0.2, 0.3] }
      })

      const result = await provider.embed(['hello world'])

      expect(result).toEqual([[0.1, 0.2, 0.3]])
      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'gemini-embedding-001',
        content: 'hello world',
        outputDimensionality: 768,
        taskType: 'RETRIEVAL_DOCUMENT'
      })
    })

    it('should pass custom taskType', async () => {
      mockEmbedContent.mockResolvedValue({
        embedding: { values: [0.1, 0.2] }
      })

      await provider.embed(['query text'], 'RETRIEVAL_QUERY')

      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'RETRIEVAL_QUERY' })
      )
    })
  })

  describe('embed - batch', () => {
    it('should return vectors for multiple texts', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [
          { values: [0.1, 0.2] },
          { values: [0.3, 0.4] },
          { values: [0.5, 0.6] }
        ]
      })

      const result = await provider.embed(['one', 'two', 'three'])

      expect(result).toEqual([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]])
      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'gemini-embedding-001',
        contents: ['one', 'two', 'three'],
        outputDimensionality: 768,
        taskType: 'RETRIEVAL_DOCUMENT'
      })
    })
  })

  describe('embed - error handling', () => {
    it('should return null on non-retryable error', async () => {
      mockEmbedContent.mockRejectedValue(new Error('invalid input'))

      const result = await provider.embed(['bad input'])

      expect(result).toBeNull()
    })

    it('should retry on 429 with exponential backoff', async () => {
      const rateLimitError = new Error('rate limit')
      rateLimitError.status = 429

      mockEmbedContent
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({ embedding: { values: [0.1] } })

      const result = await provider.embed(['retry me'])

      expect(result).toEqual([[0.1]])
      expect(mockEmbedContent).toHaveBeenCalledTimes(2)
    })

    it('should return null after exhausting retries on 429', async () => {
      const rateLimitError = new Error('rate limit')
      rateLimitError.status = 429

      mockEmbedContent.mockRejectedValue(rateLimitError)

      const result = await provider.embed(['always limited'])

      expect(result).toBeNull()
      // 1 initial + 3 retries = 4 calls
      expect(mockEmbedContent).toHaveBeenCalledTimes(4)
    })

    it('should not retry on non-429 errors', async () => {
      const serverError = new Error('server error')
      serverError.status = 500

      mockEmbedContent.mockRejectedValue(serverError)

      const result = await provider.embed(['server fail'])

      expect(result).toBeNull()
      expect(mockEmbedContent).toHaveBeenCalledTimes(1)
    })
  })

  describe('name', () => {
    it('should return gemini-embedding', () => {
      expect(provider.name).toBe('gemini-embedding')
    })
  })

  describe('registry', () => {
    it('should self-register and be creatable via registry', () => {
      const p = createEmbeddingProvider('gemini', { embedding: { dimensions: 256 } })
      expect(p).toBeInstanceOf(GeminiEmbeddingProvider)
      expect(p.dimensions).toBe(256)
    })
  })
})
