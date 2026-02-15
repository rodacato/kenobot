import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { runScenario } from '../runner.js'

describe('Scenario: Multi-turn conversation history', () => {
  it('should include previous turns in correct order', async () => {
    await runScenario({
      name: 'multi-turn-history',
      turns: [
        {
          user: 'My name is Carlos',
          response: 'Nice to meet you, Carlos!'
        },
        {
          user: 'What is my name?',
          response: 'Your name is Carlos!',
          assert: async ({ state }) => {
            const call = state.getLastProviderCall()
            const messages = call.messages

            // Verify order, not just presence
            expect(messages[0]).toEqual({ role: 'user', content: 'My name is Carlos' })
            expect(messages[1]).toEqual({ role: 'assistant', content: 'Nice to meet you, Carlos!' })
            expect(messages[2]).toEqual({ role: 'user', content: 'What is my name?' })
          }
        }
      ]
    })
  }, 15000)

  it('should persist messages to session file in order', async () => {
    await runScenario({
      name: 'multi-turn-session',
      turns: [
        {
          user: 'first message',
          response: 'first reply'
        },
        {
          user: 'second message',
          response: 'second reply',
          assert: async ({ state, sessionId }) => {
            const history = await state.getSessionHistory(sessionId)
            expect(history.length).toBeGreaterThanOrEqual(4)

            // Verify sequential role alternation
            expect(history[0].role).toBe('user')
            expect(history[0].content).toBe('first message')
            expect(history[1].role).toBe('assistant')
            expect(history[1].content).toBe('first reply')
            expect(history[2].role).toBe('user')
            expect(history[2].content).toBe('second message')
          }
        }
      ]
    })
  }, 15000)
})
