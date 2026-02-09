import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    configure: vi.fn()
  },
  Logger: class MockLogger {
    constructor() {
      this.info = vi.fn()
      this.warn = vi.fn()
      this.error = vi.fn()
      this.configure = vi.fn()
    }
  }
}))

vi.mock('grammy', () => ({
  Bot: class MockBot {
    constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn() } }
    on() {}
    async start() {}
    async stop() {}
  }
}))

import { createTestApp } from '../harness.js'

// --- Feature 1: Memory extraction ---

describe('Feature: Memory extraction', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp()
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  it('should extract <memory> tag, remove from response, and persist to daily log', async () => {
    harness.provider.setNextResponse(
      'Sure thing! <memory>user likes coffee in the morning</memory> Anything else?'
    )

    const res = await harness.sendMessage('remember this', 'mem-test')
    expect(res.status).toBe(200)

    // Tag should be stripped from the response
    expect(res.body.response).not.toContain('<memory>')
    expect(res.body.response).not.toContain('</memory>')
    expect(res.body.response).toContain('Sure thing!')
    expect(res.body.response).toContain('Anything else?')

    // Fact should persist in daily log
    const date = new Date().toISOString().slice(0, 10)
    const dailyLog = await readFile(
      join(harness.dataDir, 'memory', `${date}.md`), 'utf8'
    )
    expect(dailyLog).toContain('user likes coffee in the morning')
  }, 10000)
})

// --- Feature 2: Chat memory ---

describe('Feature: Chat memory', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp()
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  it('should extract <chat-memory> tag and persist to per-chat daily log', async () => {
    const chatId = 'chatmem-test'
    harness.provider.setNextResponse(
      'Got it. <chat-memory>prefers formal tone in this chat</chat-memory>'
    )

    const res = await harness.sendMessage('note this', chatId)
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<chat-memory>')

    // Chat memory persists in per-chat directory
    // sessionId = http-http-{chatId}
    const sessionId = `http-http-${chatId}`
    const date = new Date().toISOString().slice(0, 10)
    const chatLog = await readFile(
      join(harness.dataDir, 'memory', 'chats', sessionId, `${date}.md`), 'utf8'
    )
    expect(chatLog).toContain('prefers formal tone in this chat')
  }, 10000)
})

// --- Feature 3: User preferences ---

describe('Feature: User preferences', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp()
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  it('should extract <user> tag and persist to USER.md', async () => {
    harness.provider.setNextResponse(
      'Updated! <user>Timezone: UTC-6</user>'
    )

    const res = await harness.sendMessage('set my timezone', 'user-test')
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<user>')
    expect(res.body.response).toContain('Updated!')

    // Preference saved in identity directory
    const userMd = await readFile(
      join(harness.dataDir, 'identities', 'test', 'USER.md'), 'utf8'
    )
    expect(userMd).toContain('Timezone: UTC-6')
    expect(userMd).toContain('Learned Preferences')
  }, 10000)
})

// --- Feature 4: Bootstrap complete ---

describe('Feature: Bootstrap complete', () => {
  let harness
  let bootstrapPath

  beforeAll(async () => {
    harness = await createTestApp({}, {
      setup: async ({ identityDir }) => {
        await writeFile(
          join(identityDir, 'BOOTSTRAP.md'),
          '# Welcome\nThis is your first conversation.'
        )
      }
    })
    bootstrapPath = join(harness.dataDir, 'identities', 'test', 'BOOTSTRAP.md')
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  it('should delete BOOTSTRAP.md when response contains <bootstrap-complete/>', async () => {
    // Verify BOOTSTRAP.md exists before the test
    await expect(access(bootstrapPath)).resolves.toBeUndefined()

    harness.provider.setNextResponse(
      'Onboarding done! <bootstrap-complete/>'
    )

    const res = await harness.sendMessage('finish setup', 'boot-test')
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<bootstrap-complete')

    // BOOTSTRAP.md should be deleted
    await expect(access(bootstrapPath)).rejects.toThrow()
  }, 10000)
})

// --- Feature 5: Skill activation ---

describe('Feature: Skill activation', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp({}, {
      setup: async ({ skillsDir }) => {
        const skillDir = join(skillsDir, 'weather')
        await mkdir(skillDir, { recursive: true })
        await writeFile(join(skillDir, 'manifest.json'), JSON.stringify({
          name: 'weather',
          description: 'Get weather information',
          triggers: ['weather', 'forecast', 'temperatura']
        }))
        await writeFile(join(skillDir, 'SKILL.md'),
          '# Weather Skill\nYou are a weather assistant. Provide weather information.'
        )
      }
    })
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  it('should inject skill context when message matches a trigger', async () => {
    harness.provider.setNextResponse('The weather today is sunny!')

    const res = await harness.sendMessage("what's the weather today?", 'skill-test')
    expect(res.status).toBe(200)

    // Verify skill was injected into the system prompt
    const { options } = harness.provider.lastCall
    expect(options.system).toContain('Active skill: weather')
    expect(options.system).toContain('Weather Skill')
  }, 10000)
})

// --- Feature 6: Session history ---

describe('Feature: Session history', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp()
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  it('should persist user and assistant messages in JSONL session file', async () => {
    const chatId = 'history-test'
    const sessionId = `http-http-${chatId}`

    // Send 3 messages to the same chat
    for (const msg of ['first message', 'second message', 'third message']) {
      const res = await harness.sendMessage(msg, chatId)
      expect(res.status).toBe(200)
    }

    // Read the JSONL session file
    const sessionFile = await readFile(
      join(harness.dataDir, 'sessions', `${sessionId}.jsonl`), 'utf8'
    )
    const entries = sessionFile.trim().split('\n').map(line => JSON.parse(line))

    // 3 user + 3 assistant = 6 entries
    expect(entries).toHaveLength(6)
    expect(entries.filter(e => e.role === 'user')).toHaveLength(3)
    expect(entries.filter(e => e.role === 'assistant')).toHaveLength(3)

    // Verify content ordering
    expect(entries[0].content).toBe('first message')
    expect(entries[0].role).toBe('user')
    expect(entries[1].role).toBe('assistant')
    expect(entries[2].content).toBe('second message')
    expect(entries[4].content).toBe('third message')
  }, 15000)
})

// --- Feature 7: Watchdog health ---

describe('Feature: Watchdog health', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp()
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  it('should report healthy status with provider check on /health', async () => {
    const res = await harness.getHealth()

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.uptime).toBeGreaterThanOrEqual(0)
    expect(res.body.memory).toHaveProperty('rss')
    expect(res.body.memory).toHaveProperty('heap')
    expect(res.body.pid).toBe(process.pid)
  })
})
