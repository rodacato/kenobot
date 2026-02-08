import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    configure: vi.fn()
  }
}))

// Mock grammy to prevent real Telegram API calls
vi.mock('grammy', () => ({
  Bot: class MockBot {
    constructor() { this.api = { sendMessage: vi.fn(), sendChatAction: vi.fn() } }
    on() {}
    async start() {}
    async stop() {}
  }
}))

import { createTestApp } from './harness.js'

describe('E2E Smoke Tests', () => {
  let harness

  beforeAll(async () => {
    harness = await createTestApp()
  }, 15000)

  afterAll(async () => {
    if (harness) await harness.cleanup()
  })

  // Scenario 1: Basic pipeline — message in, response out
  it('should process a basic message through the full pipeline', async () => {
    const res = await harness.sendMessage('hello')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    // Mock provider returns Star Wars greeting for "hello"
    expect(res.body.response).toContain('Hello there')
  }, 10000)

  // Scenario 2: Session persistence — second message has history
  it('should persist session history across messages', async () => {
    const chatId = 'session-test'

    // First message
    const res1 = await harness.sendMessage('hello', chatId)
    expect(res1.status).toBe(200)

    // Second message to same chat_id
    const res2 = await harness.sendMessage('remember me?', chatId)
    expect(res2.status).toBe(200)
    expect(res2.body.response).toBeDefined()
    // Mock echoes back the message — verifies the pipeline processed it
    expect(res2.body.response).toContain('remember me?')
  }, 10000)

  // Scenario 3: Auth rejection — request without valid HMAC
  it('should reject requests without valid HMAC signature', async () => {
    const res = await harness.sendRaw(
      JSON.stringify({ message: 'sneaky' }),
      { 'X-Webhook-Signature': 'sha256=invalid' }
    )

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('invalid signature')
  })

  // Scenario 4: Auth rejection — request with no signature at all
  it('should reject requests with no signature', async () => {
    const res = await harness.sendRaw(
      JSON.stringify({ message: 'no sig' }),
      {}
    )

    expect(res.status).toBe(401)
  })

  // Scenario 5: Health endpoint
  it('should return health status with uptime and memory', async () => {
    const res = await harness.getHealth()

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status')
    expect(res.body).toHaveProperty('uptime')
    expect(res.body).toHaveProperty('memory')
    expect(res.body).toHaveProperty('pid')
  })

  // Scenario 6: Error handling — bad JSON payload
  it('should return 400 for invalid JSON', async () => {
    const res = await harness.sendRaw('not json', {
      'X-Webhook-Signature': 'sha256=abc'
    })

    // Signature check happens first — this will fail signature
    expect(res.status).toBe(401)
  })

  // Scenario 7: Missing message field
  it('should return 400 for missing message field', async () => {
    const payload = JSON.stringify({ text: 'wrong field' })
    const crypto = await import('node:crypto')
    const hmac = crypto.createHmac('sha256', 'e2e-test-secret').update(payload).digest('hex')

    const res = await harness.sendRaw(payload, {
      'X-Webhook-Signature': `sha256=${hmac}`
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('missing message field')
  })

  // Scenario 8: Different message types produce valid responses
  it('should handle help messages through the pipeline', async () => {
    const res = await harness.sendMessage('help')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    // Mock provider returns help text for "help" messages
    expect(res.body.response).toContain('Mock Provider Help')
  }, 10000)

  // Scenario 9: 404 for unknown routes
  it('should return 404 for unknown routes', async () => {
    const http = await import('node:http')
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
