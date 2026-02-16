import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.debug = vi.fn(); this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { runScenario } from '../runner.js'

describe('Scenario: Consciousness graceful degradation', () => {
  it('should respond normally when consciousness CLI is unavailable', async () => {
    // Enable consciousness with a nonexistent CLI command to test ENOENT degradation.
    // Spawn fails fast → gateway returns null → heuristic fallback.
    await runScenario({
      name: 'consciousness-degradation',
      config: { CONSCIOUSNESS_ENABLED: 'true', CONSCIOUSNESS_PROVIDER: 'nonexistent-consciousness-cli' },
      turns: [
        {
          user: 'how do I configure my webhook?',
          response: 'You can configure webhooks in the settings panel.',
          assert: async ({ result }) => {
            expect(result.status).toBe(200)
            expect(result.body.response).toContain('configure webhooks')
          }
        }
      ]
    })
  }, 15000)

  it('should respond normally with consciousness explicitly disabled', async () => {
    await runScenario({
      name: 'consciousness-disabled',
      config: { CONSCIOUSNESS_ENABLED: 'false' },
      turns: [
        {
          user: 'what is the status?',
          response: 'Everything is running fine.',
          assert: async ({ result }) => {
            expect(result.status).toBe(200)
            expect(result.body.response).toBe('Everything is running fine.')
          }
        }
      ]
    })
  }, 15000)
})

describe('Scenario: Consciousness + chat context interaction', () => {
  it('should pass chat context through retrieval when consciousness is active', async () => {
    // Consciousness enabled with nonexistent CLI — degrades to heuristic but chat context still flows.
    await runScenario({
      name: 'consciousness-chat-context',
      config: { CONSCIOUSNESS_ENABLED: 'true', CONSCIOUSNESS_PROVIDER: 'nonexistent-consciousness-cli' },
      turns: [
        {
          user: 'this is a backend team chat',
          response: '<chat-context>Type: Work group (backend)\nTone: Technical</chat-context> Noted.'
        },
        {
          user: 'how should we handle errors?',
          response: 'Use structured error handling with try/catch.',
          assert: async ({ result, state }) => {
            expect(result.status).toBe(200)

            // Chat context should be in system prompt for the second turn
            const system = state.getLastSystemPrompt()
            expect(system).toContain('Chat context')
            expect(system).toContain('Type: Work group (backend)')
            expect(system).toContain('Tone: Technical')
          }
        }
      ]
    })
  }, 15000)
})

describe('Scenario: Consciousness coexistence with memory tags', () => {
  it('should process memory tags independently of consciousness', async () => {
    // Consciousness enabled (nonexistent CLI) — memory tags work independently.
    await runScenario({
      name: 'consciousness-memory-coexist',
      config: { CONSCIOUSNESS_ENABLED: 'true', CONSCIOUSNESS_PROVIDER: 'nonexistent-consciousness-cli' },
      turns: [
        {
          user: 'remember this and set context',
          response: [
            'Got it!',
            '<memory>User prefers structured error handling</memory>',
            '<chat-context>Type: Dev team\nTone: Concise</chat-context>',
            '<working-memory>- Discussing error patterns\n- Team prefers explicit handling</working-memory>'
          ].join('\n'),
          assert: async ({ result, state, sessionId }) => {
            expect(result.status).toBe(200)

            // All tags stripped from response
            expect(result.body.response).not.toContain('<memory>')
            expect(result.body.response).not.toContain('<chat-context>')
            expect(result.body.response).not.toContain('<working-memory>')
            expect(result.body.response).toContain('Got it!')

            // Memory persisted
            const daily = await state.getDailyLog()
            expect(daily).toContain('User prefers structured error handling')

            // Chat context persisted
            const ctx = await state.getChatContext(sessionId)
            expect(ctx).toContain('Type: Dev team')

            // Working memory persisted
            const wm = await state.getWorkingMemory(sessionId)
            expect(wm).toContain('Discussing error patterns')
          }
        },
        {
          user: 'what were we discussing?',
          response: 'We were discussing error handling patterns.',
          assert: async ({ result, state }) => {
            expect(result.status).toBe(200)

            // System prompt should contain chat context from previous turn
            const system = state.getLastSystemPrompt()
            expect(system).toContain('Type: Dev team')
          }
        }
      ]
    })
  }, 15000)

  it('should handle multi-turn with consciousness disabled and memory tags', async () => {
    await runScenario({
      name: 'consciousness-off-memory-on',
      config: { CONSCIOUSNESS_ENABLED: 'false' },
      turns: [
        {
          user: 'save this fact',
          response: '<memory>Important deployment procedure</memory> Saved.'
        },
        {
          user: 'what did I save?',
          response: 'You saved a deployment procedure note.',
          assert: async ({ result, state }) => {
            expect(result.status).toBe(200)

            // Memory should still work even with consciousness off
            const daily = await state.getDailyLog()
            expect(daily).toContain('Important deployment procedure')
          }
        }
      ]
    })
  }, 15000)
})
