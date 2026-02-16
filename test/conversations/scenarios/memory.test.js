import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.debug = vi.fn(); this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { runScenario } from '../runner.js'

describe('Scenario: Global memory extraction', () => {
  it('should extract a single <memory> tag and persist to daily log', async () => {
    await runScenario({
      name: 'mem-single-tag',
      turns: [
        {
          user: 'remember this about me',
          response: 'Sure! <memory>user likes coffee</memory> Noted.',
          assert: async ({ result, state }) => {
            expect(result.status).toBe(200)
            expect(result.body.response).not.toContain('<memory>')
            expect(result.body.response).toContain('Noted.')
            const daily = await state.getDailyLog()
            expect(daily).toContain('user likes coffee')
          }
        }
      ]
    })
  }, 15000)

  it('should extract multiple <memory> tags from one response', async () => {
    await runScenario({
      name: 'mem-multi-tags',
      turns: [
        {
          user: 'two facts about me',
          response: '<memory>fact A</memory> middle <memory>fact B</memory>',
          assert: async ({ result, state }) => {
            expect(result.status).toBe(200)
            expect(result.body.response).not.toContain('<memory>')
            const daily = await state.getDailyLog()
            expect(daily).toContain('fact A')
            expect(daily).toContain('fact B')
          }
        }
      ]
    })
  }, 15000)

  it('should skip empty <memory> tags', async () => {
    await runScenario({
      name: 'mem-empty-tag',
      turns: [
        {
          user: 'empty memory',
          response: 'ok <memory>  </memory> done',
          assert: async ({ result, state }) => {
            expect(result.status).toBe(200)
            const daily = await state.getDailyLog()
            // Should not have any entries (empty tag skipped)
            const lines = daily.split('\n').filter(l => l.startsWith('## '))
            const emptyEntries = lines.filter(l => l.match(/## \d{2}:\d{2} — \s*$/))
            expect(emptyEntries).toHaveLength(0)
          }
        }
      ]
    })
  }, 15000)
})

describe('Scenario: Chat memory extraction', () => {
  it('should persist <chat-memory> to per-chat directory', async () => {
    await runScenario({
      name: 'chatmem-basic',
      turns: [
        {
          user: 'note this for our chat',
          response: 'Got it. <chat-memory>prefers formal tone</chat-memory>',
          assert: async ({ result, state, sessionId }) => {
            expect(result.status).toBe(200)
            expect(result.body.response).not.toContain('<chat-memory>')
            const log = await state.getChatDailyLog(sessionId)
            expect(log).toContain('prefers formal tone')
          }
        }
      ]
    })
  }, 15000)

  it('should isolate chat memory between different chats', async () => {
    // Uses per-turn chatId override to test two chats in one scenario
    await runScenario({
      name: 'chatmem-isolation',
      turns: [
        {
          user: 'msg for chat A',
          chatId: 'iso-chat-A',
          response: '<chat-memory>secret for A</chat-memory>'
        },
        {
          user: 'msg for chat B',
          chatId: 'iso-chat-B',
          response: '<chat-memory>secret for B</chat-memory>',
          assert: async ({ state }) => {
            const logA = await state.getChatDailyLog(state.sessionId('iso-chat-A'))
            const logB = await state.getChatDailyLog(state.sessionId('iso-chat-B'))

            expect(logA).toContain('secret for A')
            expect(logA).not.toContain('secret for B')
            expect(logB).toContain('secret for B')
            expect(logB).not.toContain('secret for A')
          }
        }
      ]
    })
  }, 15000)
})

describe('Scenario: Combined tags in single response', () => {
  it('should extract all tag types from one response', async () => {
    await runScenario({
      name: 'combined-tags',
      turns: [
        {
          user: 'remember all of this',
          response: 'Result: <memory>global fact</memory> noted <chat-memory>chat fact</chat-memory> <working-memory>scratchpad items</working-memory>',
          assert: async ({ result, state, sessionId }) => {
            // All tags stripped from response (tag removal may leave extra whitespace)
            expect(result.body.response).not.toContain('<memory>')
            expect(result.body.response).not.toContain('<chat-memory>')
            expect(result.body.response).not.toContain('<working-memory>')
            expect(result.body.response).toContain('Result:')
            expect(result.body.response).toContain('noted')

            // Each memory type persisted correctly
            const daily = await state.getDailyLog()
            expect(daily).toContain('global fact')

            const chatLog = await state.getChatDailyLog(sessionId)
            expect(chatLog).toContain('chat fact')

            const wm = await state.getWorkingMemory(sessionId)
            expect(wm).toContain('scratchpad items')

            // Session history stores clean text (no tags)
            const history = await state.getSessionHistory(sessionId)
            const lastAssistant = history.filter(h => h.role === 'assistant').pop()
            expect(lastAssistant.content).not.toContain('<memory>')
            expect(lastAssistant.content).not.toContain('<chat-memory>')
            expect(lastAssistant.content).not.toContain('<working-memory>')
            expect(lastAssistant.content).toContain('noted')
          }
        }
      ]
    })
  }, 15000)
})

describe('Scenario: Plain response (no tags)', () => {
  it('should produce no memory side effects for tagless response', async () => {
    await runScenario({
      name: 'plain-no-tags',
      turns: [
        {
          user: 'just a normal question',
          response: 'Just a plain answer with no tags at all.',
          assert: async ({ result, state, sessionId }) => {
            expect(result.body.response).toBe('Just a plain answer with no tags at all.')
            // No memory files created
            const daily = await state.getDailyLog()
            expect(daily).toBe('')
            const chatLog = await state.getChatDailyLog(sessionId)
            expect(chatLog).toBe('')
            const wm = await state.getWorkingMemory(sessionId)
            expect(wm).toBeNull()
          }
        }
      ]
    })
  }, 15000)
})
