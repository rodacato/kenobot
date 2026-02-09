import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn() } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

describe('Feature: Health endpoint', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should return health status with expected fields', async () => {
    const res = await harness.getHealth()

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.pid).toBe(process.pid)
    expect(res.body.uptime).toBeGreaterThanOrEqual(0)
    expect(res.body.memory).toHaveProperty('rss')
    expect(res.body.memory).toHaveProperty('heap')
    expect(res.body.timestamp).toBeGreaterThan(0)
  })
})

describe('Feature: Watchdog status', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should report HEALTHY state with registered checks', async () => {
    const status = harness.app.watchdog.getStatus()

    expect(status.state).toBe('HEALTHY')
    expect(status.uptime).toBeGreaterThanOrEqual(0)
    expect(status.memory).toHaveProperty('rss')
    expect(status.checks).toHaveProperty('provider')
    expect(status.checks).toHaveProperty('memory')
    expect(status.checks.provider.critical).toBe(true)
  })
})
