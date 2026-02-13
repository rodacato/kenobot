import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: "test_bot" }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

// --- Global memory extraction ---

// SKIPPED: Tag extraction features (<memory>) are not implemented yet
// These tests are for planned but unimplemented functionality
// See IMPLEMENTATION_PLAN.md Phase 1b for Cognitive System archival
describe.skip('Feature: Global memory', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should extract a single <memory> tag and persist to daily log', async () => {
    harness.provider.setNextResponse('Sure! <memory>user likes coffee</memory> Noted.')

    const res = await harness.sendMessage('remember this', 'mem-single')
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<memory>')
    expect(res.body.response).toContain('Sure!')
    expect(res.body.response).toContain('Noted.')

    const date = new Date().toISOString().slice(0, 10)
    const log = await readFile(join(harness.dataDir, 'memory', `${date}.md`), 'utf8')
    expect(log).toContain('user likes coffee')
  }, 10000)

  it('should extract multiple <memory> tags from one response', async () => {
    harness.provider.setNextResponse(
      '<memory>fact A</memory> middle <memory>fact B</memory>'
    )

    const res = await harness.sendMessage('two facts', 'mem-multi')
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<memory>')

    const date = new Date().toISOString().slice(0, 10)
    const log = await readFile(join(harness.dataDir, 'memory', `${date}.md`), 'utf8')
    expect(log).toContain('fact A')
    expect(log).toContain('fact B')
  }, 10000)

  it('should skip empty <memory> tags', async () => {
    harness.provider.setNextResponse('ok <memory>  </memory> done')

    const res = await harness.sendMessage('empty tag', 'mem-empty')
    expect(res.status).toBe(200)

    const date = new Date().toISOString().slice(0, 10)
    const log = await readFile(join(harness.dataDir, 'memory', `${date}.md`), 'utf8')
    // Should not have an entry with just whitespace
    const lines = log.split('\n').filter(l => l.startsWith('## '))
    const emptyEntries = lines.filter(l => l.match(/## \d{2}:\d{2} — \s*$/))
    expect(emptyEntries).toHaveLength(0)
  }, 10000)
})

// --- Chat memory ---

describe.skip('Feature: Chat memory', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should persist chat-memory to per-chat directory', async () => {
    harness.provider.setNextResponse('Got it. <chat-memory>prefers formal tone</chat-memory>')

    const res = await harness.sendMessage('note this', 'chatmem1')
    expect(res.status).toBe(200)
    expect(res.body.response).not.toContain('<chat-memory>')

    const sessionId = 'http-http-chatmem1'
    const date = new Date().toISOString().slice(0, 10)
    const log = await readFile(
      join(harness.dataDir, 'memory', 'chats', sessionId, `${date}.md`), 'utf8'
    )
    expect(log).toContain('prefers formal tone')
  }, 10000)

  it('should isolate chat memory between different chats', async () => {
    harness.provider.setNextResponse('<chat-memory>secret for A</chat-memory>')
    await harness.sendMessage('msg', 'chat-A')

    harness.provider.setNextResponse('<chat-memory>secret for B</chat-memory>')
    await harness.sendMessage('msg', 'chat-B')

    const date = new Date().toISOString().slice(0, 10)
    const logA = await readFile(
      join(harness.dataDir, 'memory', 'chats', 'http-http-chat-A', `${date}.md`), 'utf8'
    )
    const logB = await readFile(
      join(harness.dataDir, 'memory', 'chats', 'http-http-chat-B', `${date}.md`), 'utf8'
    )

    expect(logA).toContain('secret for A')
    expect(logA).not.toContain('secret for B')
    expect(logB).toContain('secret for B')
    expect(logB).not.toContain('secret for A')
  }, 10000)
})

// --- Working memory ---

describe.skip('Feature: Working memory', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should replace (not append) working memory on each update', async () => {
    const chatId = 'wm-replace'
    const sessionId = `http-http-${chatId}`

    harness.provider.setNextResponse('ok <working-memory>version 1</working-memory>')
    await harness.sendMessage('first', chatId)

    harness.provider.setNextResponse('ok <working-memory>version 2</working-memory>')
    await harness.sendMessage('second', chatId)

    const content = await readFile(
      join(harness.dataDir, 'memory', 'working', `${sessionId}.md`), 'utf8'
    )
    expect(content).toBe('version 2')
    expect(content).not.toContain('version 1')
  }, 10000)
})
