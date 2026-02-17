import { GoogleGenAI } from '@google/genai'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * API adapter for the consciousness layer.
 *
 * Uses the Gemini API directly via @google/genai SDK.
 * Same contract as CLIConsciousnessAdapter: call(systemPrompt, taskPrompt) → string.
 * Faster than CLI adapter (no spawn overhead, direct HTTP).
 */
export default class APIConsciousnessAdapter {
  constructor({ model = 'gemini-2.0-flash', timeout = 30000, logger = defaultLogger } = {}) {
    this.model = model
    this.timeout = timeout
    this.logger = logger

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for gemini-api consciousness adapter')
    }

    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }

  /**
   * Execute a one-shot consciousness call via API.
   * @param {string} systemPrompt - Expert profile system prompt
   * @param {string} taskPrompt - The task/question to evaluate
   * @returns {Promise<string>} Raw text response
   */
  async call(systemPrompt, taskPrompt) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: taskPrompt }] }],
        config: {
          systemInstruction: systemPrompt
        }
      })

      return (response.text || '').trim()
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Consciousness API timed out after ${this.timeout}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
