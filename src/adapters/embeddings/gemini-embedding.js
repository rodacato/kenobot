import { GoogleGenAI } from '@google/genai'
import { registerEmbeddingProvider } from './registry.js'
import logger from '../../infrastructure/logger.js'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

/**
 * Gemini embedding provider using @google/genai SDK.
 *
 * Supports Matryoshka dimensionality reduction and batch embedding.
 * Returns null on failure (designed for fire-and-forget callers).
 */
export default class GeminiEmbeddingProvider {
  constructor(config) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required for gemini embedding provider')
    }

    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    this.model = config.embedding?.model || 'gemini-embedding-001'
    this.dimensions = config.embedding?.dimensions || 768

    logger.info('gemini-embedding', 'initialized', {
      model: this.model,
      dimensions: this.dimensions
    })
  }

  /**
   * Embed one or more texts into vectors.
   *
   * @param {string[]} texts - Texts to embed
   * @param {string} [taskType='RETRIEVAL_DOCUMENT'] - Gemini task type
   * @returns {Promise<number[][]|null>} Array of vectors, or null on failure
   */
  async embed(texts, taskType = 'RETRIEVAL_DOCUMENT') {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.models.embedContent({
          model: this.model,
          contents: texts.length === 1 ? texts[0] : texts,
          config: {
            outputDimensionality: this.dimensions,
            taskType
          }
        })
        logger.debug('gemini-embedding', 'embedding_generated', {
          count: texts.length, dimensions: response.embeddings?.[0]?.values?.length
        })
        return response.embeddings.map(e => e.values)
      } catch (error) {
        if (error.status === 429 && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt)
          logger.warn('gemini-embedding', 'rate_limited', { attempt: attempt + 1, delay })
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        logger.warn('gemini-embedding', 'embedding_failed', {
          error: error.message,
          status: error.status,
          texts: texts.length
        })
        return null
      }
    }
    return null
  }

  get name() {
    return 'gemini-embedding'
  }
}

registerEmbeddingProvider('gemini', (config) => new GeminiEmbeddingProvider(config))
