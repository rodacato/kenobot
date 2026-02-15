import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { runScenario } from '../runner.js'

describe('Scenario: Chat context lifecycle', () => {
  it('should persist chat context from response tag', async () => {
    await runScenario({
      name: 'ctx-persist',
      turns: [
        {
          user: 'remember this is my work group',
          response: 'Got it! <chat-context>Type: Work group\nTone: Professional</chat-context>',
          assert: async ({ result, state, sessionId }) => {
            expect(result.status).toBe(200)
            const ctx = await state.getChatContext(sessionId)
            expect(ctx).toContain('Type: Work group')
            expect(ctx).toContain('Tone: Professional')
          }
        }
      ]
    })
  }, 15000)

  it('should replace (not append) chat context on each update', async () => {
    await runScenario({
      name: 'ctx-replace',
      turns: [
        {
          user: 'this is a friends group',
          response: 'ok <chat-context>Type: Friends\nTone: Casual</chat-context>'
        },
        {
          user: 'actually this is my work group',
          response: 'updated <chat-context>Type: Work group\nTone: Professional</chat-context>',
          assert: async ({ state, sessionId }) => {
            const ctx = await state.getChatContext(sessionId)
            expect(ctx).toBe('Type: Work group\nTone: Professional')
            expect(ctx).not.toContain('Friends')
          }
        }
      ]
    })
  }, 15000)

  it('should include chat context in system prompt on next turn', async () => {
    await runScenario({
      name: 'ctx-in-prompt',
      turns: [
        {
          user: 'this is a backend team group',
          response: '<chat-context>Type: Work group (backend team)\nTone: Technical, concise</chat-context> Noted.'
        },
        {
          user: 'how should we deploy?',
          response: 'Use the CI pipeline.',
          assert: async ({ state }) => {
            const system = state.getLastSystemPrompt()
            expect(system).toContain('Chat context')
            expect(system).toContain('Type: Work group (backend team)')
            expect(system).toContain('Tone: Technical, concise')
          }
        }
      ]
    })
  }, 15000)

  it('should strip chat-context tags from displayed response', async () => {
    await runScenario({
      name: 'ctx-strip-tags',
      turns: [
        {
          user: 'this is my family chat',
          response: 'Understood! <chat-context>Type: Family\nTone: Warm, casual</chat-context> I\'ll keep it casual here.',
          assert: async ({ result }) => {
            expect(result.body.response).not.toContain('<chat-context>')
            expect(result.body.response).not.toContain('</chat-context>')
            expect(result.body.response).toContain('Understood!')
            expect(result.body.response).toContain('casual here')
          }
        }
      ]
    })
  }, 15000)

  it('should isolate chat context between different chats', async () => {
    await runScenario({
      name: 'ctx-isolation',
      turns: [
        {
          user: 'this is work',
          chatId: 'ctx-work',
          response: '<chat-context>Type: Work\nTone: Professional</chat-context> Got it.'
        },
        {
          user: 'this is friends',
          chatId: 'ctx-friends',
          response: '<chat-context>Type: Friends\nTone: Casual</chat-context> Sure!',
          assert: async ({ state }) => {
            const workCtx = await state.getChatContext(state.sessionId('ctx-work'))
            const friendsCtx = await state.getChatContext(state.sessionId('ctx-friends'))

            expect(workCtx).toContain('Type: Work')
            expect(workCtx).not.toContain('Friends')
            expect(friendsCtx).toContain('Type: Friends')
            expect(friendsCtx).not.toContain('Work')
          }
        }
      ]
    })
  }, 15000)

  it('should not create context file for tagless response', async () => {
    await runScenario({
      name: 'ctx-no-side-effect',
      turns: [
        {
          user: 'just a normal message',
          response: 'Here is a normal response with no tags.',
          assert: async ({ state, sessionId }) => {
            const ctx = await state.getChatContext(sessionId)
            expect(ctx).toBeNull()
          }
        }
      ]
    })
  }, 15000)

  it('should work alongside other memory tags', async () => {
    await runScenario({
      name: 'ctx-coexistence',
      turns: [
        {
          user: 'remember everything about this chat',
          response: [
            'Noted!',
            '<memory>User wants comprehensive tracking</memory>',
            '<chat-context>Type: Project planning\nTone: Structured</chat-context>',
            '<working-memory>- Setting up chat context\n- User wants tracking</working-memory>'
          ].join('\n'),
          assert: async ({ result, state, sessionId }) => {
            // All tags stripped from response
            expect(result.body.response).not.toContain('<memory>')
            expect(result.body.response).not.toContain('<chat-context>')
            expect(result.body.response).not.toContain('<working-memory>')
            expect(result.body.response).toContain('Noted!')

            // Each memory type persisted correctly
            const daily = await state.getDailyLog()
            expect(daily).toContain('User wants comprehensive tracking')

            const ctx = await state.getChatContext(sessionId)
            expect(ctx).toContain('Type: Project planning')

            const wm = await state.getWorkingMemory(sessionId)
            expect(wm).toContain('Setting up chat context')
          }
        }
      ]
    })
  }, 15000)
})
