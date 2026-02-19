import defaultLogger from '../../infrastructure/logger.js'

/**
 * Cerebras consciousness adapter.
 *
 * Uses the Cerebras Inference API (OpenAI-compatible) via native fetch.
 * Same contract as other adapters: call(systemPrompt, taskPrompt) → string.
 * No extra dependencies — uses Node.js built-in fetch.
 */
export default class CerebrasConsciousnessAdapter {
  constructor({ model = 'gpt-oss-120b', timeout = 30000, logger = defaultLogger } = {}) {
    this.model = model
    this.timeout = timeout
    this.logger = logger

    if (!process.env.CEREBRAS_API_KEY) {
      throw new Error('CEREBRAS_API_KEY is required for cerebras consciousness adapter')
    }

    this.apiKey = process.env.CEREBRAS_API_KEY
  }

  /**
   * Execute a one-shot consciousness call via Cerebras API.
   * @param {string} systemPrompt - Expert profile system prompt
   * @param {string} taskPrompt - The task/question to evaluate
   * @returns {Promise<string>} Raw text response
   */
  async call(systemPrompt, taskPrompt) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: taskPrompt }
          ],
          max_tokens: 512,
          temperature: 0.1
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Cerebras API error ${response.status}: ${body}`)
      }

      const data = await response.json()
      return (data.choices?.[0]?.message?.content || '').trim()
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Cerebras API timed out after ${this.timeout}ms`)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
