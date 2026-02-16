import BaseProvider from './base.js'
import { registerProvider } from './registry.js'
import logger from '../../infrastructure/logger.js'

const API_URL = 'https://api.cerebras.ai/v1/chat/completions'

/**
 * CerebrasAPIProvider - Direct API integration with Cerebras Inference
 *
 * OpenAI-compatible API with extremely fast inference (~3000 tok/s).
 * Uses native fetch (no SDK dependency).
 * Requires CEREBRAS_API_KEY environment variable.
 */
export default class CerebrasAPIProvider extends BaseProvider {
  constructor(config) {
    super()
    this.config = config

    if (!process.env.CEREBRAS_API_KEY) {
      throw new Error('CEREBRAS_API_KEY environment variable is required for cerebras-api provider')
    }

    this.apiKey = process.env.CEREBRAS_API_KEY

    // Model mapping: friendly names → API model IDs
    const modelMap = {
      '8b': 'llama3.1-8b',
      '120b': 'gpt-oss-120b',
      'qwen': 'qwen-3-235b-a22b-instruct-2507'
    }

    this.model = modelMap[config.model] || config.model || modelMap['120b']
    logger.info('cerebras-api', 'initialized', { model: this.model })
  }

  /**
   * Send messages to Cerebras and get response
   * @param {Array} messages - Array of {role: 'user'|'assistant', content: string|Array}
   * @param {Object} options - Additional options (max_tokens, temperature, tools, etc.)
   * @returns {Object} {content, toolCalls, stopReason, rawContent, usage}
   */
  async chat(messages, options = {}) {
    try {
      const body = {
        model: this.model,
        messages: this._convertMessages(messages, options.system)
      }

      if (options.max_tokens) {
        body.max_completion_tokens = options.max_tokens
      }

      if (options.temperature !== undefined) {
        body.temperature = options.temperature
      }

      if (options.tools?.length) {
        body.tools = options.tools
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorBody = await response.text()
        const error = new Error(`Cerebras API error: ${response.status} ${errorBody}`)
        error.status = response.status
        throw error
      }

      const data = await response.json()
      const choice = data.choices[0]
      const message = choice.message

      const content = message.content || ''

      let toolCalls = null
      if (message.tool_calls?.length) {
        toolCalls = message.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments)
        }))
      }

      const stopReasonMap = {
        'stop': 'end_turn',
        'tool_calls': 'tool_use',
        'length': 'max_tokens'
      }

      return {
        content,
        toolCalls,
        stopReason: stopReasonMap[choice.finish_reason] || 'end_turn',
        rawContent: message,
        usage: {
          input_tokens: data.usage?.prompt_tokens || 0,
          output_tokens: data.usage?.completion_tokens || 0
        }
      }
    } catch (error) {
      if (error.status) throw error
      logger.error('cerebras-api', 'request_failed', { error: error.message, status: error.status })
      const wrapped = new Error(`Cerebras API error: ${error.message}`)
      if (error.status) wrapped.status = error.status
      throw wrapped
    }
  }

  /**
   * Convert Anthropic-style messages to OpenAI format.
   * System prompt becomes a system message. Tool results are converted.
   * @param {Array} messages
   * @param {string} [system] - System prompt
   * @returns {Array} OpenAI-format messages
   * @private
   */
  _convertMessages(messages, system) {
    const converted = []

    if (system) {
      converted.push({ role: 'system', content: system })
    }

    for (const msg of messages) {
      // Already in OpenAI format (from buildToolResultMessages)
      if (msg.role === 'tool') {
        converted.push(msg)
        continue
      }

      // Assistant message with tool_calls (from buildToolResultMessages)
      if (msg.role === 'assistant' && msg.tool_calls) {
        converted.push(msg)
        continue
      }

      // Anthropic-style array content (tool results from other providers or session history)
      if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(b => b.type === 'tool_result')
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            converted.push({
              role: 'tool',
              content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
              tool_call_id: tr.tool_use_id
            })
          }
          continue
        }

        // Other array content — extract text
        const text = msg.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
        converted.push({ role: msg.role, content: text || '' })
        continue
      }

      converted.push({ role: msg.role, content: msg.content || '' })
    }

    return converted
  }

  /**
   * Adapt tool definitions from Anthropic format to OpenAI format.
   * @param {Array} definitions - [{name, description, input_schema}]
   * @returns {Array} OpenAI tools format
   */
  adaptToolDefinitions(definitions) {
    return definitions.map(def => ({
      type: 'function',
      function: {
        name: def.name,
        description: def.description,
        parameters: def.input_schema
      }
    }))
  }

  /**
   * Build tool result messages in OpenAI format.
   * @param {Object} rawContent - Assistant message object (with content and tool_calls)
   * @param {Array<{id: string, result: string, isError: boolean}>} results
   * @returns {Array} Messages to append
   */
  buildToolResultMessages(rawContent, results) {
    const messages = [
      {
        role: 'assistant',
        content: rawContent?.content || '',
        tool_calls: rawContent?.tool_calls || []
      }
    ]

    for (const r of results) {
      messages.push({
        role: 'tool',
        content: r.result,
        tool_call_id: r.id
      })
    }

    return messages
  }

  get supportsTools() {
    return true
  }

  get name() {
    return 'cerebras-api'
  }
}

registerProvider('cerebras-api', (config) => new CerebrasAPIProvider(config))
