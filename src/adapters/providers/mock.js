import BaseProvider from './base.js'
import { registerProvider } from './registry.js'

/**
 * MockProvider - Simple mock for testing without real LLM
 *
 * Returns canned responses with Star Wars personality.
 * Useful for testing the message flow without needing Claude CLI/API.
 */
export default class MockProvider extends BaseProvider {
  constructor(config) {
    super()
    this.config = config
    this._nextResponse = null
    this._lastCall = null
  }

  /**
   * Set the response for the next chat() call.
   * After one call consumes it, reverts to default behavior.
   * @param {string} response - Text to return as content
   */
  setNextResponse(response) {
    this._nextResponse = response
  }

  /**
   * Get the messages and options from the last chat() call.
   * Useful for verifying what context was passed to the provider.
   * @returns {{ messages: Array, options: Object }|null}
   */
  get lastCall() {
    return this._lastCall
  }

  async chat(messages, options = {}) {
    this._lastCall = { messages, options }

    const lastMessage = messages[messages.length - 1]
    const userText = typeof lastMessage?.content === 'string' ? lastMessage.content : ''

    // Simulate a small delay like a real LLM
    await new Promise(resolve => setTimeout(resolve, 50))

    // Scriptable response: consume queued response if set
    if (this._nextResponse !== null) {
      const content = this._nextResponse
      this._nextResponse = null
      return {
        content,
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: { mock: true }
      }
    }

    // Simulate tool_use when message contains "fetch http"
    if (userText.match(/fetch https?:\/\//i)) {
      const url = userText.match(/https?:\/\/\S+/)?.[0]
      return {
        content: `I'll fetch ${url} for you.`,
        toolCalls: [{ id: 'mock_tool_1', name: 'fetch_url', input: { url } }],
        stopReason: 'tool_use',
        rawContent: [
          { type: 'text', text: `I'll fetch ${url} for you.` },
          { type: 'tool_use', id: 'mock_tool_1', name: 'fetch_url', input: { url } }
        ],
        usage: { mock: true }
      }
    }

    // Tool result follow-up: return end_turn after tool execution
    if (Array.isArray(lastMessage?.content) && lastMessage.content.some(b => b.type === 'tool_result')) {
      const toolResult = lastMessage.content.find(b => b.type === 'tool_result')
      return {
        content: `Here's what I found: ${toolResult.content?.slice(0, 200) || 'done'}`,
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null,
        usage: { mock: true }
      }
    }

    // Simple response logic for testing
    let response = ''

    if (userText.toLowerCase().includes('hello')) {
      response = 'Hello there! General Kenobi! 🤖\n\nI\'m KenoBot, running in mock mode for testing. The Force is strong with this one!'
    } else if (userText.toLowerCase().includes('help')) {
      response = 'Mock Provider Help:\n\n- Send any message and I\'ll respond\n- I\'m using a mock LLM (no real AI yet)\n- Once testing works, we\'ll switch to real Claude\n\nMay the Force be with you!'
    } else {
      response = `You said: "${userText}"\n\nI'm KenoBot in mock mode. I received your message successfully! ✅\n\nThe message flow is working:\nTelegram → Bus → Mock Provider → Bus → Telegram\n\nReady to switch to real Claude when you are!`
    }

    return {
      content: response,
      toolCalls: null,
      stopReason: 'end_turn',
      rawContent: null,
      usage: { mock: true }
    }
  }

  get supportsTools() {
    return true
  }

  get name() {
    return 'mock'
  }
}

registerProvider('mock', (config) => new MockProvider(config))
