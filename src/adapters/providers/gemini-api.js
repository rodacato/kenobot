import { GoogleGenAI } from '@google/genai'
import BaseProvider from './base.js'
import { registerProvider } from './registry.js'
import logger from '../../infrastructure/logger.js'

/**
 * GeminiAPIProvider - Direct API integration with Google Gemini
 *
 * Uses the official @google/genai SDK to call Gemini directly.
 * Requires GEMINI_API_KEY environment variable.
 */
export default class GeminiAPIProvider extends BaseProvider {
  constructor(config) {
    super()
    this.config = config

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required for gemini-api provider')
    }

    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

    const modelMap = {
      'flash': 'gemini-2.5-flash',
      'pro': 'gemini-2.5-pro',
      'flash-lite': 'gemini-2.5-flash-lite'
    }

    this.model = modelMap[config.model] || config.model || modelMap.flash
    logger.info('gemini-api', 'initialized', { model: this.model })
  }

  /**
   * Send messages to Gemini and get response
   * @param {Array} messages - Array of {role: 'user'|'assistant', content: string|Array}
   * @param {Object} options - Additional options (max_tokens, temperature, tools, etc.)
   * @returns {Object} {content, toolCalls, stopReason, rawContent, usage}
   */
  async chat(messages, options = {}) {
    try {
      const contents = this._convertMessages(messages)

      const config = {}

      if (options.system) {
        config.systemInstruction = options.system
      }

      if (options.max_tokens) {
        config.maxOutputTokens = options.max_tokens
      }

      if (options.temperature !== undefined) {
        config.temperature = options.temperature
      }

      if (options.tools?.length) {
        config.tools = options.tools
      }

      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config
      })

      const content = response.text || ''

      const functionCalls = response.functionCalls
      let toolCalls = null

      if (functionCalls?.length) {
        toolCalls = functionCalls.map((fc, i) => ({
          id: `gemini_call_${i}`,
          name: fc.name,
          input: fc.args || {}
        }))
      }

      const finishReason = response.candidates?.[0]?.finishReason || 'STOP'
      const stopReason = finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn'

      return {
        content,
        toolCalls,
        stopReason,
        rawContent: response.candidates?.[0]?.content || null,
        usage: {
          input_tokens: response.usageMetadata?.promptTokenCount || 0,
          output_tokens: response.usageMetadata?.candidatesTokenCount || 0
        }
      }
    } catch (error) {
      logger.error('gemini-api', 'request_failed', { error: error.message, status: error.status })
      const wrapped = new Error(`Gemini API error: ${error.message}`)
      if (error.status) wrapped.status = error.status
      throw wrapped
    }
  }

  /**
   * Convert Anthropic-style messages to Gemini format.
   * @param {Array} messages
   * @returns {Array} Gemini contents array
   * @private
   */
  _convertMessages(messages) {
    return messages.map(msg => {
      const role = msg.role === 'assistant' ? 'model' : 'user'

      // Already in Gemini parts format (e.g. from buildToolResultMessages)
      if (msg.parts) {
        return { role, parts: msg.parts }
      }

      // Anthropic content array (tool results)
      if (Array.isArray(msg.content)) {
        const parts = msg.content.map(block => {
          if (block.type === 'tool_result') {
            return {
              functionResponse: {
                name: block.tool_name || block.tool_use_id,
                response: { result: block.content }
              }
            }
          }
          if (block.type === 'text') {
            return { text: block.text }
          }
          return { text: JSON.stringify(block) }
        })
        return { role, parts }
      }

      return { role, parts: [{ text: msg.content || '' }] }
    })
  }

  /**
   * Adapt tool definitions from Anthropic format to Gemini format.
   * @param {Array} definitions - [{ name, description, input_schema }]
   * @returns {Array} Gemini tools format
   */
  adaptToolDefinitions(definitions) {
    return [{
      functionDeclarations: definitions.map(def => ({
        name: def.name,
        description: def.description,
        parameters: def.input_schema
      }))
    }]
  }

  /**
   * Build tool result messages in Gemini format.
   * @param {Object} rawContent - Model's Content object (with functionCall parts)
   * @param {Array<{id: string, result: string, isError: boolean}>} results
   * @returns {Array} Messages to append
   */
  buildToolResultMessages(rawContent, results) {
    // Extract function call names from the raw model content
    const functionCallParts = rawContent?.parts?.filter(p => p.functionCall) || []

    return [
      { role: 'model', parts: rawContent?.parts || [] },
      {
        role: 'user',
        parts: results.map((r, i) => ({
          functionResponse: {
            name: functionCallParts[i]?.functionCall?.name || r.id,
            response: { result: r.result }
          }
        }))
      }
    ]
  }

  get supportsTools() {
    return true
  }

  get name() {
    return 'gemini-api'
  }
}

registerProvider('gemini-api', (config) => new GeminiAPIProvider(config))
