import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { runScenario } from '../runner.js'

describe('Scenario: Identity in context', () => {
  it('should include core identity in system prompt', async () => {
    await runScenario({
      name: 'identity-core',
      turns: [
        {
          user: 'hello',
          response: 'Hello there!',
          assert: async ({ state }) => {
            const system = state.getLastSystemPrompt()
            // Core identity from harness: "# Test Bot\nYou are a test bot."
            expect(system).toContain('Test Bot')
          }
        }
      ]
    })
  }, 15000)

  it('should include memory tag instructions in system prompt', async () => {
    await runScenario({
      name: 'identity-memory-section',
      turns: [
        {
          user: 'hello',
          response: 'Hi!',
          assert: async ({ state }) => {
            const system = state.getLastSystemPrompt()
            // Context builder includes memory tag instructions table
            expect(system).toContain('Memory tags')
            expect(system).toContain('<memory>fact</memory>')
            expect(system).toContain('<chat-memory>')
            expect(system).toContain('<working-memory>')
          }
        }
      ]
    })
  }, 15000)

  it('should surface chat-memory in context via retrieval', async () => {
    await runScenario({
      name: 'identity-chat-recall',
      turns: [
        {
          user: 'we are debugging the auth module',
          response: '<chat-memory>debugging auth module</chat-memory> Let me look at it.'
        },
        {
          // Keywords "auth" and "module" overlap with the saved chat-memory,
          // so the retrieval engine should surface this as a chat episode.
          user: 'any update on the auth module?',
          response: 'Still working on auth.',
          assert: async ({ state }) => {
            const system = state.getLastSystemPrompt()
            // Assert exact stored content, not just a keyword
            expect(system).toContain('debugging auth module')
          }
        }
      ]
    })
  }, 15000)
})
