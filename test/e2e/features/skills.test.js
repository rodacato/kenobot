import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: "test_bot" }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

describe('Feature: Skill activation', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp({}, {
      setup: async ({ skillsDir }) => {
        // Create "weather" skill
        const weatherDir = join(skillsDir, 'weather')
        await mkdir(weatherDir, { recursive: true })
        await writeFile(join(weatherDir, 'manifest.json'), JSON.stringify({
          name: 'weather',
          description: 'Get weather information',
          triggers: ['weather', 'forecast']
        }))
        await writeFile(join(weatherDir, 'SKILL.md'),
          '# Weather Skill\nProvide weather forecasts to the user.'
        )

        // Create "code" skill (no overlapping triggers with weather)
        const codeDir = join(skillsDir, 'code')
        await mkdir(codeDir, { recursive: true })
        await writeFile(join(codeDir, 'manifest.json'), JSON.stringify({
          name: 'code',
          description: 'Help with programming',
          triggers: ['code', 'programming', 'debug']
        }))
        await writeFile(join(codeDir, 'SKILL.md'),
          '# Code Skill\nHelp write and debug code.'
        )
      }
    })
  }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should inject skill context when message matches a trigger', async () => {
    harness.provider.setNextResponse('Sunny today!')
    await harness.sendMessage("what's the weather like?", 'skill1')

    const { options } = harness.provider.lastCall
    expect(options.system).toContain('Active skill: weather')
    expect(options.system).toContain('Weather Skill')
    expect(options.system).toContain('weather forecasts')
  }, 10000)

  it('should not inject skill when message does not match any trigger', async () => {
    harness.provider.setNextResponse('Hello!')
    await harness.sendMessage('hello there', 'skill2')

    const { options } = harness.provider.lastCall
    expect(options.system).not.toContain('Active skill')
  }, 10000)

  it('should activate the correct skill for each trigger', async () => {
    // "code" trigger should activate the code skill, not weather
    harness.provider.setNextResponse('result')
    await harness.sendMessage('help me debug this code', 'skill3')

    const { options } = harness.provider.lastCall
    expect(options.system).toContain('Active skill: code')
    expect(options.system).toContain('Code Skill')
    expect(options.system).not.toContain('Active skill: weather')
  }, 10000)
})
