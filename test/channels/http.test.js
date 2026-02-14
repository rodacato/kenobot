import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import http from 'node:http'
import { NervousSystem } from '../../src/nervous/index.js'
import HTTPChannel from '../../src/channels/http.js'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const SECRET = 'test-secret-key-for-hmac'

function sign(body, secret = SECRET) {
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${hmac}`
}

function request(port, { method = 'POST', path = '/webhook', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        let json
        try { json = JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, body: json, text })
      })
    })
    req.on('error', reject)
    if (method !== 'GET') req.write(bodyStr)
    req.end()
  })
}

describe('HTTPChannel', () => {
  let channel
  let bus
  let port

  beforeEach(async () => {
    bus = new NervousSystem()
    // Use port 0 to let OS assign a random available port
    channel = new HTTPChannel(bus, {
      port: 0,
      host: '127.0.0.1',
      webhookSecret: SECRET,
      timeout: 5000
    })
    await channel.start()
    port = channel.server.address().port
  })

  afterEach(async () => {
    await channel.stop()
  })

  describe('name', () => {
    it('should return http as channel name', () => {
      expect(channel.name).toBe('http')
    })
  })

  describe('GET /health', () => {
    it('should return status ok', async () => {
      const res = await request(port, { method: 'GET', path: '/health' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(res.body.uptime).toBeTypeOf('number')
      expect(res.body.pid).toBeTypeOf('number')
      expect(res.body.memory).toHaveProperty('rss')
      expect(res.body.memory).toHaveProperty('heap')
      expect(res.body.timestamp).toBeTypeOf('number')
    })
  })

  describe('routing', () => {
    it('should return 404 for unknown paths', async () => {
      const res = await request(port, { method: 'GET', path: '/unknown' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('not found')
    })

    it('should return 404 for GET /webhook', async () => {
      const res = await request(port, { method: 'GET', path: '/webhook' })

      expect(res.status).toBe(404)
    })
  })

  describe('HMAC validation', () => {
    it('should reject requests without signature', async () => {
      const body = JSON.stringify({ message: 'hello' })
      const res = await request(port, { body })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('invalid signature')
    })

    it('should reject requests with wrong signature', async () => {
      const body = JSON.stringify({ message: 'hello' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': 'sha256=wrong' }
      })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('invalid signature')
    })

    it('should reject requests with signature from different secret', async () => {
      const body = JSON.stringify({ message: 'hello' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body, 'different-secret') }
      })

      expect(res.status).toBe(401)
    })

    it('should reject when no webhook secret is configured', async () => {
      await channel.stop()
      channel = new HTTPChannel(bus, {
        port: 0,
        host: '127.0.0.1',
        webhookSecret: '',
        timeout: 5000
      })
      await channel.start()
      port = channel.server.address().port

      const body = JSON.stringify({ message: 'hello' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      expect(res.status).toBe(401)
    })
  })

  describe('request validation', () => {
    it('should reject invalid JSON', async () => {
      const body = 'not json'
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('invalid json')
    })

    it('should reject missing message field', async () => {
      const body = JSON.stringify({ text: 'wrong field' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('missing message field')
    })

    it('should reject non-string message field', async () => {
      const body = JSON.stringify({ message: 123 })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('missing message field')
    })
  })

  describe('message processing', () => {
    it('should publish message:in to bus and return agent response', async () => {
      // Simulate agent: listen for message:in, respond with message:out
      bus.on('message:in', (msg) => {
        expect(msg.channel).toBe('http')
        expect(msg.text).toBe('Hello there!')
        expect(msg.userId).toBe('webhook')

        // Simulate agent response
        setTimeout(() => {
          bus.emit('message:out', {
            chatId: msg.chatId,
            text: 'General Kenobi!',
            channel: 'http'
          })
        }, 10)
      })

      const body = JSON.stringify({ message: 'Hello there!' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(res.body.response).toBe('General Kenobi!')
    })

    it('should use unique chatId for transient requests (no chat_id)', async () => {
      const chatIds = []

      bus.on('message:in', (msg) => {
        chatIds.push(msg.chatId)
        bus.emit('message:out', {
          chatId: msg.chatId,
          text: 'ok',
          channel: 'http'
        })
      })

      const body = JSON.stringify({ message: 'test' })
      await request(port, { body, headers: { 'X-Webhook-Signature': sign(body) } })
      await request(port, { body, headers: { 'X-Webhook-Signature': sign(body) } })

      expect(chatIds).toHaveLength(2)
      expect(chatIds[0]).not.toBe(chatIds[1])
    })

    it('should use http-prefixed chat_id for persistent sessions', async () => {
      bus.on('message:in', (msg) => {
        expect(msg.chatId).toBe('http-daily-summary')
        bus.emit('message:out', {
          chatId: msg.chatId,
          text: 'ok',
          channel: 'http'
        })
      })

      const body = JSON.stringify({ message: 'test', chat_id: 'daily-summary' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      expect(res.status).toBe(200)
    })

    it('should timeout if agent does not respond', async () => {
      // Don't simulate any agent response — let it timeout
      const body = JSON.stringify({ message: 'hello' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      expect(res.status).toBe(408)
      expect(res.body.error).toBe('timeout')
    })

    it('should not match responses from other channels', async () => {
      bus.on('message:in', (msg) => {
        // Emit response for wrong channel
        bus.emit('message:out', {
          chatId: msg.chatId,
          text: 'wrong channel',
          channel: 'telegram'
        })
      })

      const body = JSON.stringify({ message: 'hello' })
      const res = await request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      // Should timeout because telegram channel response is ignored
      expect(res.status).toBe(408)
    })
  })

  describe('lifecycle', () => {
    it('should reject pending requests on stop', async () => {
      // Send a request but don't respond
      const body = JSON.stringify({ message: 'hello' })
      const responsePromise = request(port, {
        body,
        headers: { 'X-Webhook-Signature': sign(body) }
      })

      // Give time for request to arrive
      await new Promise(r => setTimeout(r, 50))

      // Stop the channel — should reject pending
      await channel.stop()

      const res = await responsePromise
      // Connection will be cut or error returned
      expect(res.status).toBe(500)
    })

    it('should clean up server on stop', async () => {
      await channel.stop()
      expect(channel.server).toBeNull()
      expect(channel._pendingRequests.size).toBe(0)
    })
  })

  describe('_isAllowed', () => {
    it('should always return true (HMAC replaces allowlist)', () => {
      expect(channel._isAllowed('anyone')).toBe(true)
      expect(channel._isAllowed()).toBe(true)
    })
  })
})
