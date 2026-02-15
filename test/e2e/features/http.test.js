import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import crypto from 'node:crypto'
import http from 'node:http'

vi.mock('../../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class { constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn(), getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' }) } }; on() {}; async start() {}; async stop() {} }
}))

import { createTestApp } from '../harness.js'

describe('Feature: HTTP channel security', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should reject requests with invalid HMAC signature', async () => {
    const res = await harness.sendRaw(
      JSON.stringify({ message: 'sneaky' }),
      { 'X-Webhook-Signature': 'sha256=invalid' }
    )

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid signature')
  })

  it('should reject requests with no signature', async () => {
    const res = await harness.sendRaw(
      JSON.stringify({ message: 'no sig' }),
      {}
    )

    expect(res.status).toBe(401)
  })

  it('should return 400 for missing message field', async () => {
    const payload = JSON.stringify({ text: 'wrong field' })
    const hmac = crypto.createHmac('sha256', 'e2e-test-secret').update(payload).digest('hex')

    const res = await harness.sendRaw(payload, {
      'X-Webhook-Signature': `sha256=${hmac}`
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('missing message field')
  })
})

describe('Feature: HTTP routing', () => {
  let harness

  beforeAll(async () => { harness = await createTestApp() }, 15000)
  afterAll(async () => { if (harness) await harness.cleanup() })

  it('should return 404 for unknown routes', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: harness.port,
        path: '/unknown',
        method: 'GET'
      }, (res) => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString())
          })
        })
      })
      req.on('error', reject)
      req.end()
    })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('not found')
  })
})
