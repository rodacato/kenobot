import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: "test_bot" }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

describe('Feature: Tool execution loop', () => {
  let harness

  beforeAll(async () => {
    // Higher timeout — tool loop does a real web_fetch which needs network time
    harness = await createTestApp({ HTTP_TIMEOUT: '30000' })
  }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should execute tool loop when provider returns toolCalls', async () => {
    // Mock provider returns tool_use for "fetch http://..." then end_turn on follow-up
    // Track how many times provider.chat is called
    let callCount = 0
    const origChat = harness.provider.chat.bind(harness.provider)
    harness.provider.chat = async (...args) => {
      callCount++
      return origChat(...args)
    }

    const res = await harness.sendMessage('fetch https://example.com', 'tool-loop')
    expect(res.status).toBe(200)

    // Provider called at least twice: 1) tool_use response, 2) end_turn after tool result
    expect(callCount).toBeGreaterThanOrEqual(2)

    // Restore original
    harness.provider.chat = origChat
  }, 35000)
})

describe('Feature: Max tool iterations safety', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp({ MAX_TOOL_ITERATIONS: '1', HTTP_TIMEOUT: '30000' })
  }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should not loop infinitely with max iterations set to 1', async () => {
    const res = await harness.sendMessage('fetch https://example.com', 'tool-max')

    // Should still complete (not hang), even if tool loop is limited
    expect(res.status).toBe(200)
    expect(res.body.response).toBeDefined()
  }, 35000)
})
