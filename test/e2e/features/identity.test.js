import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: "test_bot" }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

// --- User preferences ---

// SKIPPED: These tests use the legacy IdentityLoader (<user> tags, SOUL.md).
// The current CognitiveSystem uses <user-update> tags, core.md, rules.json,
// and preferences.md. Enabling requires updating the e2e harness to scaffold
// CognitiveSystem identity files (core.md, rules.json, preferences.md).
describe.skip('Feature: User preferences', () => {
  let harness
  let userMdPath

  beforeAll(async () => {
    harness = await createTestApp()
    userMdPath = join(harness.dataDir, 'identities', 'test', 'USER.md')
  }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should extract a single <user> tag and persist to USER.md', async () => {
    harness.provider.setNextResponse('Updated! <user>Timezone: UTC-6</user>')

    const res = await harness.sendMessage('set timezone', 'user1')
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<user>')

    const content = await readFile(userMdPath, 'utf8')
    expect(content).toContain('Learned Preferences')
    expect(content).toContain('Timezone: UTC-6')
  }, 10000)

  it('should extract multiple <user> tags from one response', async () => {
    harness.provider.setNextResponse(
      '<user>Language: Spanish</user> ok <user>Theme: dark</user>'
    )

    await harness.sendMessage('set prefs', 'user2')

    const content = await readFile(userMdPath, 'utf8')
    expect(content).toContain('Language: Spanish')
    expect(content).toContain('Theme: dark')
  }, 10000)

  it('should include user preferences in context on next message', async () => {
    // The previous tests already wrote preferences to USER.md
    harness.provider.setNextResponse('got it')
    await harness.sendMessage('anything', 'user3')

    const { options } = harness.provider.lastCall
    expect(options.system).toContain('Timezone: UTC-6')
  }, 10000)
})

// --- Bootstrap lifecycle ---

// SKIPPED: These tests use the legacy harness (SOUL.md paths, no rules.json).
// The bootstrap orchestration is now wired (AgentLoop → processBootstrapIfActive)
// and covered by unit tests in test/agent/bootstrap-integration.test.js.
// Enabling requires updating the e2e harness for CognitiveSystem identity files.
describe.skip('Feature: Bootstrap lifecycle', () => {
  let harness
  let bootstrapPath

  beforeAll(async () => {
    harness = await createTestApp({}, {
      setup: async ({ identityDir }) => {
        await writeFile(
          join(identityDir, 'BOOTSTRAP.md'),
          '# Welcome\nThis is your first conversation with KenoBot.'
        )
      }
    })
    bootstrapPath = join(harness.dataDir, 'identities', 'test', 'BOOTSTRAP.md')
  }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should include BOOTSTRAP.md content in first message context', async () => {
    harness.provider.setNextResponse('Welcome!')
    await harness.sendMessage('hi', 'boot1')

    const { options } = harness.provider.lastCall
    expect(options.system).toContain('first conversation with KenoBot')
  }, 10000)

  it('should delete BOOTSTRAP.md when response contains <bootstrap-complete/>', async () => {
    await expect(access(bootstrapPath)).resolves.toBeUndefined()

    harness.provider.setNextResponse('Done! <bootstrap-complete/>')
    const res = await harness.sendMessage('finish', 'boot2')
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<bootstrap-complete')

    await expect(access(bootstrapPath)).rejects.toThrow()
  }, 10000)

  it('should not include bootstrap content in messages after deletion', async () => {
    harness.provider.setNextResponse('normal reply')
    await harness.sendMessage('hello again', 'boot3')

    const { options } = harness.provider.lastCall
    expect(options.system).not.toContain('first conversation with KenoBot')
  }, 10000)
})
