import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { runScenario } from '../runner.js'

describe('Scenario: Working memory lifecycle', () => {
  it('should persist working memory from response tags', async () => {
    await runScenario({
      name: 'wm-persist',
      turns: [
        {
          user: 'start task: fix login bug',
          response: 'On it. <working-memory>- Fix login bug\n- Check auth flow</working-memory>',
          assert: async ({ state, sessionId }) => {
            const wm = await state.getWorkingMemory(sessionId)
            expect(wm).toContain('Fix login bug')
            expect(wm).toContain('Check auth flow')
          }
        }
      ]
    })
  }, 15000)

  it('should replace (not append) working memory on each update', async () => {
    await runScenario({
      name: 'wm-replace',
      turns: [
        {
          user: 'first task',
          response: 'ok <working-memory>version 1</working-memory>'
        },
        {
          user: 'second task',
          response: 'ok <working-memory>version 2</working-memory>',
          assert: async ({ state, sessionId }) => {
            const wm = await state.getWorkingMemory(sessionId)
            expect(wm).toBe('version 2')
            expect(wm).not.toContain('version 1')
          }
        }
      ]
    })
  }, 15000)

  it('should include working memory in system prompt on next turn', async () => {
    await runScenario({
      name: 'wm-in-context',
      turns: [
        {
          user: 'save this context',
          response: '<working-memory>project: kenobot, task: refactor</working-memory> Saved.'
        },
        {
          user: 'what was the task?',
          response: 'You were refactoring kenobot.',
          assert: async ({ state }) => {
            const system = state.getLastSystemPrompt()
            expect(system).toContain('project: kenobot, task: refactor')
          }
        }
      ]
    })
  }, 15000)

  it('should persist working memory when subsequent turns have no tag', async () => {
    await runScenario({
      name: 'wm-no-clear',
      turns: [
        {
          user: 'start tracking',
          response: '<working-memory>active task: deploy v2</working-memory> Tracking.'
        },
        {
          // Response has NO working-memory tag — should NOT clear previous
          user: 'any updates?',
          response: 'Still working on it.',
          assert: async ({ state, sessionId }) => {
            const wm = await state.getWorkingMemory(sessionId)
            expect(wm).toContain('active task: deploy v2')
            // Working memory should appear in system prompt
            const system = state.getLastSystemPrompt()
            expect(system).toContain('active task: deploy v2')
          }
        }
      ]
    })
  }, 15000)
})
