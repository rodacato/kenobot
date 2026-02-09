import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn() } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

// --- Session persistence ---

describe('Feature: Session persistence', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should persist user and assistant messages in JSONL', async () => {
    const chatId = 'persist-test'
    const sessionId = `http-http-${chatId}`

    for (const msg of ['first', 'second', 'third']) {
      const res = await harness.sendMessage(msg, chatId)
      expect(res.status).toBe(200)
    }

    const raw = await readFile(join(harness.dataDir, 'sessions', `${sessionId}.jsonl`), 'utf8')
    const entries = raw.trim().split('\n').map(l => JSON.parse(l))

    expect(entries).toHaveLength(6)
    expect(entries.filter(e => e.role === 'user')).toHaveLength(3)
    expect(entries.filter(e => e.role === 'assistant')).toHaveLength(3)
    expect(entries[0]).toMatchObject({ role: 'user', content: 'first' })
    expect(entries[2]).toMatchObject({ role: 'user', content: 'second' })
    expect(entries[4]).toMatchObject({ role: 'user', content: 'third' })
  }, 15000)

  it('should isolate sessions between different chatIds', async () => {
    harness.provider.setNextResponse('reply to A')
    await harness.sendMessage('message for A', 'iso-A')

    harness.provider.setNextResponse('reply to B')
    await harness.sendMessage('message for B', 'iso-B')

    const rawA = await readFile(join(harness.dataDir, 'sessions', 'http-http-iso-A.jsonl'), 'utf8')
    const rawB = await readFile(join(harness.dataDir, 'sessions', 'http-http-iso-B.jsonl'), 'utf8')

    expect(rawA).toContain('message for A')
    expect(rawA).not.toContain('message for B')
    expect(rawB).toContain('message for B')
    expect(rawB).not.toContain('message for A')
  }, 10000)
})

// --- Multi-turn context ---

describe('Feature: Multi-turn context', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should include previous messages in provider call on second turn', async () => {
    const chatId = 'multi-turn'

    harness.provider.setNextResponse('first reply')
    await harness.sendMessage('hello bot', chatId)

    harness.provider.setNextResponse('second reply')
    await harness.sendMessage('follow up', chatId)

    // The second call should include the full conversation history
    const { messages } = harness.provider.lastCall
    const contents = messages.map(m => m.content)
    expect(contents).toContain('hello bot')
    expect(contents).toContain('first reply')
    expect(contents).toContain('follow up')
  }, 10000)

  it('should not share history between transient sessions (no chatId)', async () => {
    harness.provider.setNextResponse('reply 1')
    await harness.sendMessage('transient msg 1')

    harness.provider.setNextResponse('reply 2')
    await harness.sendMessage('transient msg 2')

    // Second call should NOT contain the first message (different UUID sessions)
    const { messages } = harness.provider.lastCall
    const contents = messages.map(m => m.content)
    expect(contents).toContain('transient msg 2')
    expect(contents).not.toContain('transient msg 1')
  }, 10000)
})
