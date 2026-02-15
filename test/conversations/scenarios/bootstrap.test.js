import { describe, it, expect, vi } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runScenario } from '../runner.js'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

const BOOTSTRAP_CONTENT = `# Bootstrap Instructions

## Phase 1: Observation (messages 1-5)
Greet the user naturally, observe communication style.

## Phase 2: Checkpoint (message 6)
Present observations for confirmation.

## Phase 3: Boundaries (message 7)
Ask about red lines.
`

describe('Scenario: Bootstrap onboarding', () => {
  it('should detect active bootstrap from BOOTSTRAP.md', async () => {
    await runScenario({
      name: 'bootstrap-detect',
      setup: async ({ identityDir }) => {
        await writeFile(join(identityDir, 'BOOTSTRAP.md'), BOOTSTRAP_CONTENT)
      },
      turns: [
        {
          user: 'Hola!',
          response: 'Hey! Bienvenido.',
          assert: async ({ state }) => {
            expect(await state.isBootstrapping()).toBe(true)
            const system = state.getLastSystemPrompt()
            expect(system).toContain('Bootstrap')
          }
        }
      ]
    })
  }, 15000)

  it('should complete bootstrap when <bootstrap-complete/> tag is received', async () => {
    // Pre-create preferences.md so the post-processor skips saveBootstrapPreferences()
    // and goes straight to deleteBootstrap(). This isolates the tag → deletion flow.
    // (Full multi-turn bootstrap lifecycle is tested at the unit level in test/cognitive/)
    await runScenario({
      name: 'bootstrap-complete',
      setup: async ({ identityDir }) => {
        await writeFile(join(identityDir, 'BOOTSTRAP.md'), BOOTSTRAP_CONTENT)
        await writeFile(join(identityDir, 'preferences.md'), '# Preferences\nLanguage: es')
      },
      turns: [
        {
          // Single turn — no history means ProfileInferrer won't fire,
          // so setNextResponse is consumed by the actual provider call.
          user: 'Listo, ya me conoces',
          response: 'Perfecto, ya te conozco. <bootstrap-complete/>',
          assert: async ({ result, state }) => {
            expect(result.status).toBe(200)
            expect(result.body.response).not.toContain('<bootstrap-complete/>')
            // BOOTSTRAP.md should be deleted
            expect(await state.isBootstrapping()).toBe(false)
          }
        }
      ]
    })
  }, 15000)

  it('should not be in bootstrap mode without BOOTSTRAP.md', async () => {
    await runScenario({
      name: 'bootstrap-inactive',
      // No setup → no BOOTSTRAP.md
      turns: [
        {
          user: 'hello',
          response: 'Hi!',
          assert: async ({ state }) => {
            expect(await state.isBootstrapping()).toBe(false)
            const system = state.getLastSystemPrompt()
            expect(system).not.toContain('Bootstrap')
          }
        }
      ]
    })
  }, 15000)
})
