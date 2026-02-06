import BaseProvider from './base.js'

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
  }

  async chat(messages, options = {}) {
    const lastMessage = messages[messages.length - 1]
    const userText = lastMessage?.content || ''

    // Simple response logic for testing
    let response = ''

    if (userText.toLowerCase().includes('hello')) {
      response = 'Hello there! General Kenobi! 🤖\n\nI\'m KenoBot, running in mock mode for testing. The Force is strong with this one!'
    } else if (userText.toLowerCase().includes('help')) {
      response = 'Mock Provider Help:\n\n- Send any message and I\'ll respond\n- I\'m using a mock LLM (no real AI yet)\n- Once testing works, we\'ll switch to real Claude\n\nMay the Force be with you!'
    } else {
      response = `You said: "${userText}"\n\nI'm KenoBot in mock mode. I received your message successfully! ✅\n\nThe message flow is working:\nTelegram → Bus → Mock Provider → Bus → Telegram\n\nReady to switch to real Claude when you are!`
    }

    // Simulate a small delay like a real LLM
    await new Promise(resolve => setTimeout(resolve, 500))

    return {
      content: response,
      usage: { mock: true }
    }
  }

  get name() {
    return 'mock'
  }
}
