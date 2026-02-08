import Anthropic from '@anthropic-ai/sdk'
import BaseProvider from './base.js'
import { registerProvider } from './registry.js'
import logger from '../logger.js'

/**
 * ClaudeAPIProvider - Direct API integration with Anthropic
 *
 * Uses the official Anthropic SDK to call Claude directly.
 * Requires ANTHROPIC_API_KEY environment variable.
 *
 * More control than ClaudeCLIProvider and works as root.
 */
export default class ClaudeAPIProvider extends BaseProvider {
  constructor(config) {
    super()
    this.config = config

    // Validate API key
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for claude-api provider')
    }

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    })

    // Model mapping: friendly names → API model IDs
    const modelMap = {
      'opus': 'claude-opus-4-20250514',
      'sonnet': 'claude-sonnet-4-5-20250929',
      'haiku': 'claude-haiku-4-5-20251001'
    }

    this.model = modelMap[config.model] || config.model || modelMap.sonnet
    logger.info('claude-api', 'initialized', { model: this.model })
  }

  /**
   * Send messages to Claude and get response
   * @param {Array} messages - Array of {role: 'user'|'assistant', content: string|Array}
   * @param {Object} options - Additional options (max_tokens, temperature, tools, etc.)
   * @returns {Object} {content: string, toolCalls: Array|null, stopReason: string, rawContent: Array, usage: object}
   */
  async chat(messages, options = {}) {
    try {
      const params = {
        model: this.model,
        max_tokens: options.max_tokens || 4096,
        temperature: options.temperature,
        messages
      }

      if (options.system) {
        params.system = options.system
      }

      if (options.tools?.length) {
        params.tools = options.tools
      }

      const response = await this.client.messages.create(params)

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')

      const toolCalls = response.content
        .filter(block => block.type === 'tool_use')
        .map(block => ({ id: block.id, name: block.name, input: block.input }))

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        stopReason: response.stop_reason,
        rawContent: response.content,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens
        }
      }
    } catch (error) {
      logger.error('claude-api', 'request_failed', { error: error.message, status: error.status })
      const wrapped = new Error(`Claude API error: ${error.message}`)
      if (error.status) wrapped.status = error.status
      throw wrapped
    }
  }

  get name() {
    return 'claude-api'
  }
}

registerProvider('claude-api', (config) => new ClaudeAPIProvider(config))
