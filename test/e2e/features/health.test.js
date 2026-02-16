import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: "test_bot" }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

describe('Feature: Health endpoint', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should return health status with expected fields', async () => {
    const res = await harness.getHealth()

    expect(res.status).toBe(200)

    // Process info (nested under process when stats function is available)
    const proc = res.body.process || res.body
    expect(proc.status).toBe('ok')
    expect(proc.pid).toBe(process.pid)
    expect(proc.uptime).toBeGreaterThanOrEqual(0)
    expect(proc.memory).toHaveProperty('rss')
    expect(proc.memory).toHaveProperty('heap')
    expect(proc.timestamp).toBeGreaterThan(0)

    // Stats sections should be present when stats function is wired
    if (res.body.process) {
      expect(res.body).toHaveProperty('nervous')
      expect(res.body).toHaveProperty('responses')
      expect(res.body).toHaveProperty('consciousness')
      expect(res.body).toHaveProperty('watchdog')
    }
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
