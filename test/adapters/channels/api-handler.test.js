import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import http from 'node:http'
import { createServer } from 'node:http'
import { NervousSystem } from '../../../src/domain/nervous/index.js'
import APIHandler from '../../../src/adapters/channels/api-handler.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../../src/infrastructure/config.js', () => ({
  default: {}
}))

const API_KEY = 'kb-testkey1234567890123456789012345678901234567890123456789012'

// ─── Test HTTP server wrapping APIHandler ─────────────────────────────────
// We spin up a plain node:http server that delegates all requests to APIHandler,
// mirroring what HTTPChannel does.

function request(port, { method = 'GET', path = '/api/v1/health', body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const bodyStr = body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : ''
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
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        let json
        try { json = JSON.parse(text) } catch { json = null }
        resolve({ status: res.statusCode, headers: res.headers, body: json, text })
      })
    })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function auth(headers = {}) {
  return { ...headers, 'Authorization': `Bearer ${API_KEY}` }
}

// ─── Mock domain objects ──────────────────────────────────────────────────

function makeMemory() {
  return {
    getLongTermMemory: vi.fn().mockResolvedValue('Long-term memory content'),
    getRecentDays: vi.fn().mockResolvedValue([{ date: '2026-01-01', content: 'entry' }]),
    working: { get: vi.fn().mockResolvedValue({ content: '{}' }) },
    procedural: { readPatterns: vi.fn().mockResolvedValue([{ pattern: 'test pattern' }]) },
  }
}

function makeScheduler() {
  return {
    list: vi.fn().mockReturnValue([{ id: 'sched-1', cronExpr: '0 4 * * *', message: 'hello' }]),
    add: vi.fn().mockResolvedValue('sched-new'),
    remove: vi.fn().mockResolvedValue(),
  }
}

function makeSleepCycle() {
  return {
    getState: vi.fn().mockReturnValue({ status: 'idle', lastRun: null }),
    run: vi.fn().mockResolvedValue(),
  }
}

function makeAgent() {
  return {
    getActiveTasks: vi.fn().mockReturnValue([]),
  }
}

function makeTaskStore() {
  return {
    loadEvents: vi.fn().mockResolvedValue([{ event: 'started', ts: Date.now() }]),
  }
}

function makeCostTracker(withinBudget = true) {
  return {
    isWithinBudget: vi.fn().mockReturnValue(withinBudget),
  }
}

function makeStats() {
  return vi.fn().mockReturnValue({ process: { status: 'ok' }, nervous: {}, responses: {} })
}

function makeStorage(sessionsDir = '/tmp/sessions') {
  return {
    sessionsDir,
    loadSession: vi.fn().mockResolvedValue([
      { role: 'user', content: 'Hello', timestamp: 1000 },
      { role: 'assistant', content: 'Hi!', timestamp: 2000 },
    ]),
  }
}

// ─── Test setup ──────────────────────────────────────────────────────────

describe('APIHandler', () => {
  let handler
  let bus
  let server
  let port

  beforeEach(async () => {
    bus = new NervousSystem()

    handler = new APIHandler({
      bus,
      apiKey: API_KEY,
      storage: makeStorage(),
      memory: makeMemory(),
      scheduler: makeScheduler(),
      sleepCycle: makeSleepCycle(),
      agent: makeAgent(),
      taskStore: makeTaskStore(),
      costTracker: makeCostTracker(),
      stats: makeStats(),
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      timeout: 150,
      rateLimit: 100,
      corsOrigin: '*',
    })

    // Spin up a minimal HTTP server — same pattern as HTTPChannel
    server = createServer((req, res) => handler.handle(req, res))
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
    })
    port = server.address().port

    handler.subscribe(bus)
  })

  afterEach(async () => {
    handler.unsubscribe()
    await new Promise(resolve => server.close(resolve))
  })

  // ─── Auth ───────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(port, { path: '/api/v1/stats' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 for wrong API key', async () => {
      const res = await request(port, {
        path: '/api/v1/stats',
        headers: { 'Authorization': 'Bearer kb-wrongkey' }
      })
      expect(res.status).toBe(401)
    })

    it('allows valid API key', async () => {
      const res = await request(port, { path: '/api/v1/stats', headers: auth() })
      expect(res.status).toBe(200)
    })
  })

  // ─── Rate limiting ───────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
      const lowHandler = new APIHandler({
        bus, apiKey: API_KEY,
        storage: makeStorage(), memory: makeMemory(), scheduler: makeScheduler(),
        sleepCycle: makeSleepCycle(), agent: makeAgent(), taskStore: makeTaskStore(),
        costTracker: makeCostTracker(), stats: makeStats(),
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        timeout: 100, rateLimit: 2, corsOrigin: '*',
      })
      const s = createServer((req, res) => lowHandler.handle(req, res))
      await new Promise((resolve, reject) => {
        s.once('error', reject)
        s.listen(0, '127.0.0.1', () => { s.removeListener('error', reject); resolve() })
      })
      const p = s.address().port
      lowHandler.subscribe(bus)

      await request(p, { path: '/api/v1/health' })
      await request(p, { path: '/api/v1/health' })
      const res = await request(p, { path: '/api/v1/health' })

      expect(res.status).toBe(429)
      expect(res.body.error.code).toBe('RATE_LIMITED')
      expect(res.body.error.retryable).toBe(true)

      lowHandler.unsubscribe()
      await new Promise(resolve => s.close(resolve))
    })
  })

  // ─── CORS ────────────────────────────────────────────────────────────────

  describe('CORS headers', () => {
    it('includes Access-Control-Allow-Origin on all responses', async () => {
      const res = await request(port, { path: '/api/v1/health' })
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })

    it('handles OPTIONS preflight with 204', async () => {
      const res = await request(port, { method: 'OPTIONS', path: '/api/v1/stats' })
      expect(res.status).toBe(204)
    })
  })

  // ─── Discovery ───────────────────────────────────────────────────────────

  describe('GET /api/v1/', () => {
    it('returns endpoint index without auth', async () => {
      const res = await request(port, { path: '/api/v1/' })
      expect(res.status).toBe(200)
      expect(res.body.data.version).toBe('v1')
      expect(Array.isArray(res.body.data.endpoints)).toBe(true)
      expect(res.body.data.endpoints.length).toBeGreaterThan(5)
    })
  })

  // ─── Health ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/health', () => {
    it('returns ok without auth', async () => {
      const res = await request(port, { path: '/api/v1/health' })
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('ok')
      expect(res.body.data.timestamp).toBeTypeOf('number')
    })
  })

  // ─── Stats ───────────────────────────────────────────────────────────────

  describe('GET /api/v1/stats', () => {
    it('returns system stats', async () => {
      const res = await request(port, { path: '/api/v1/stats', headers: auth() })
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('process')
    })
  })

  // ─── 404 ─────────────────────────────────────────────────────────────────

  describe('routing', () => {
    it('returns 404 for unknown paths with error envelope', async () => {
      const res = await request(port, { path: '/api/v1/unknown', headers: auth() })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(res.body.meta).toHaveProperty('requestId')
    })
  })

  // ─── Conversations ────────────────────────────────────────────────────────

  describe('conversations', () => {
    describe('GET /api/v1/conversations', () => {
      it('returns conversations array', async () => {
        // No files to scan in test env — returns empty list
        const res = await request(port, { path: '/api/v1/conversations', headers: auth() })
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.data.conversations)).toBe(true)
      })
    })

    describe('POST /api/v1/conversations', () => {
      it('creates conversation with provided id', async () => {
        const res = await request(port, {
          method: 'POST', path: '/api/v1/conversations',
          headers: auth(), body: { id: 'test-conv-id' }
        })
        expect(res.status).toBe(201)
        expect(res.body.data.id).toBe('test-conv-id')
      })

      it('generates uuid when id not provided', async () => {
        const res = await request(port, {
          method: 'POST', path: '/api/v1/conversations',
          headers: auth(), body: {}
        })
        expect(res.status).toBe(201)
        expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/)
      })
    })

    describe('GET /api/v1/conversations/:id', () => {
      it('returns conversation metadata', async () => {
        const res = await request(port, {
          path: '/api/v1/conversations/test-123', headers: auth()
        })
        expect(res.status).toBe(200)
        expect(res.body.data).toHaveProperty('id', 'test-123')
        expect(res.body.data).toHaveProperty('messageCount')
        expect(res.body.data).toHaveProperty('title')
      })
    })

    describe('GET /api/v1/conversations/:id/messages', () => {
      it('returns message list', async () => {
        const res = await request(port, {
          path: '/api/v1/conversations/test-123/messages', headers: auth()
        })
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.data.messages)).toBe(true)
        expect(res.body.data.messages[0].role).toBe('user')
      })
    })

    describe('POST /api/v1/conversations/:id/messages', () => {
      it('returns 400 when content is missing', async () => {
        const res = await request(port, {
          method: 'POST', path: '/api/v1/conversations/test-conv/messages',
          headers: auth(), body: {}
        })
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('MISSING_FIELD')
      })

      it('returns 409 when conversation is already in progress', async () => {
        handler._activeChats.add('test-conflict')
        const res = await request(port, {
          method: 'POST', path: '/api/v1/conversations/test-conflict/messages',
          headers: auth(), body: { content: 'hello' }
        })
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('CONFLICT')
        handler._activeChats.delete('test-conflict')
      })

      it('returns 429 when budget is exceeded', async () => {
        const h = new APIHandler({
          bus, apiKey: API_KEY,
          storage: makeStorage(), memory: makeMemory(), scheduler: makeScheduler(),
          sleepCycle: makeSleepCycle(), agent: makeAgent(), taskStore: makeTaskStore(),
          costTracker: makeCostTracker(false), stats: makeStats(),
          logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
          timeout: 100, rateLimit: 100, corsOrigin: '*',
        })
        const s = createServer((req, res) => h.handle(req, res))
        await new Promise((resolve, reject) => {
          s.once('error', reject)
          s.listen(0, '127.0.0.1', () => { s.removeListener('error', reject); resolve() })
        })
        const p = s.address().port
        h.subscribe(bus)

        const res = await request(p, {
          method: 'POST', path: '/api/v1/conversations/test-budget/messages',
          headers: { 'Authorization': `Bearer ${API_KEY}` },
          body: { content: 'hello' }
        })
        expect(res.status).toBe(429)
        expect(res.body.error.code).toBe('BUDGET_EXCEEDED')

        h.unsubscribe()
        await new Promise(resolve => s.close(resolve))
      })

      it('returns agent response when bus fires MESSAGE_OUT', async () => {
        bus.on('message:in', (msg) => {
          expect(msg.channel).toBe('api')
          setTimeout(() => {
            bus.emit('message:out', { chatId: msg.chatId, text: 'Hello from agent!', channel: 'api' })
          }, 10)
        })

        const res = await request(port, {
          method: 'POST', path: '/api/v1/conversations/conv-reply-test/messages',
          headers: auth(), body: { content: 'ping' }
        })

        expect(res.status).toBe(200)
        expect(res.body.data.role).toBe('assistant')
        expect(res.body.data.content).toBe('Hello from agent!')
      })

      it('returns 504 when agent does not respond', async () => {
        const res = await request(port, {
          method: 'POST', path: '/api/v1/conversations/conv-timeout/messages',
          headers: auth(), body: { content: 'hello' }
        })
        expect(res.status).toBe(504)
        expect(res.body.error.code).toBe('GATEWAY_TIMEOUT')
        expect(res.body.error.retryable).toBe(true)
      })

      it('does not match responses from other channels', async () => {
        bus.on('message:in', (msg) => {
          setTimeout(() => {
            // Wrong channel — should not resolve the API request
            bus.emit('message:out', { chatId: msg.chatId, text: 'wrong channel', channel: 'telegram' })
          }, 10)
        })

        const res = await request(port, {
          method: 'POST', path: '/api/v1/conversations/conv-wrong-channel/messages',
          headers: auth(), body: { content: 'hello' }
        })
        expect(res.status).toBe(504)
      })
    })

    describe('DELETE /api/v1/conversations/:id', () => {
      it('returns 404 when session file does not exist', async () => {
        const res = await request(port, {
          method: 'DELETE', path: '/api/v1/conversations/nonexistent',
          headers: auth()
        })
        expect(res.status).toBe(404)
        expect(res.body.error.code).toBe('NOT_FOUND')
      })
    })
  })

  // ─── Memory ──────────────────────────────────────────────────────────────

  describe('memory', () => {
    it('GET /api/v1/memory returns long-term memory', async () => {
      const res = await request(port, { path: '/api/v1/memory', headers: auth() })
      expect(res.status).toBe(200)
      expect(res.body.data.memory).toBe('Long-term memory content')
    })

    it('GET /api/v1/memory/recent returns recent entries', async () => {
      const res = await request(port, { path: '/api/v1/memory/recent', headers: auth() })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data.entries)).toBe(true)
    })

    it('GET /api/v1/memory/recent respects ?days param', async () => {
      const memory = makeMemory()
      handler._memory = memory
      await request(port, { path: '/api/v1/memory/recent?days=7', headers: auth() })
      expect(memory.getRecentDays).toHaveBeenCalledWith(7)
    })

    it('GET /api/v1/memory/working/:sessionId returns working memory', async () => {
      const res = await request(port, {
        path: '/api/v1/memory/working/telegram-12345', headers: auth()
      })
      expect(res.status).toBe(200)
      expect(res.body.data.sessionId).toBe('telegram-12345')
    })

    it('GET /api/v1/memory/patterns returns patterns', async () => {
      const res = await request(port, { path: '/api/v1/memory/patterns', headers: auth() })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data.patterns)).toBe(true)
    })
  })

  // ─── Scheduler ───────────────────────────────────────────────────────────

  describe('scheduler', () => {
    it('GET /api/v1/scheduler returns task list', async () => {
      const res = await request(port, { path: '/api/v1/scheduler', headers: auth() })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data.tasks)).toBe(true)
    })

    it('POST /api/v1/scheduler creates a task', async () => {
      const res = await request(port, {
        method: 'POST', path: '/api/v1/scheduler',
        headers: auth(),
        body: { cronExpr: '0 9 * * *', message: 'Good morning', description: 'Morning greeting' }
      })
      expect(res.status).toBe(201)
      expect(res.body.data.id).toBe('sched-new')
    })

    it('POST /api/v1/scheduler returns 400 when required fields missing', async () => {
      const res = await request(port, {
        method: 'POST', path: '/api/v1/scheduler',
        headers: auth(), body: { cronExpr: '0 9 * * *' }
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('MISSING_FIELD')
    })

    it('DELETE /api/v1/scheduler/:id removes task', async () => {
      const res = await request(port, {
        method: 'DELETE', path: '/api/v1/scheduler/sched-1',
        headers: auth()
      })
      expect(res.status).toBe(204)
    })
  })

  // ─── Sleep cycle ─────────────────────────────────────────────────────────

  describe('sleep-cycle', () => {
    it('GET /api/v1/sleep-cycle returns state', async () => {
      const res = await request(port, { path: '/api/v1/sleep-cycle', headers: auth() })
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('status')
    })

    it('POST /api/v1/sleep-cycle/run returns 202', async () => {
      const res = await request(port, {
        method: 'POST', path: '/api/v1/sleep-cycle/run', headers: auth()
      })
      expect(res.status).toBe(202)
      expect(res.body.data.status).toBe('accepted')
    })
  })

  // ─── Tasks ────────────────────────────────────────────────────────────────

  describe('tasks', () => {
    it('GET /api/v1/tasks/active returns active tasks', async () => {
      const res = await request(port, { path: '/api/v1/tasks/active', headers: auth() })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data.tasks)).toBe(true)
    })

    it('GET /api/v1/tasks/:id/events returns event log', async () => {
      const res = await request(port, {
        path: '/api/v1/tasks/task-abc/events', headers: auth()
      })
      expect(res.status).toBe(200)
      expect(res.body.data.taskId).toBe('task-abc')
      expect(Array.isArray(res.body.data.events)).toBe(true)
    })
  })

  // ─── Response envelope ────────────────────────────────────────────────────

  describe('response envelope', () => {
    it('success responses have data and meta fields', async () => {
      const res = await request(port, { path: '/api/v1/health' })
      expect(res.body).toHaveProperty('data')
      expect(res.body).toHaveProperty('meta')
      expect(res.body.meta).toHaveProperty('requestId')
      expect(res.body.meta).toHaveProperty('timestamp')
    })

    it('error responses have error and meta fields', async () => {
      const res = await request(port, { path: '/api/v1/stats' }) // missing auth
      expect(res.body).toHaveProperty('error')
      expect(res.body).toHaveProperty('meta')
      expect(res.body.error).toHaveProperty('code')
      expect(res.body.error).toHaveProperty('message')
      expect(res.body.error).toHaveProperty('hint')
      expect(res.body.error).toHaveProperty('retryable')
    })
  })

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('unsubscribe rejects pending requests', async () => {
      // Start a send but don't fire message:out
      const sendPromise = request(port, {
        method: 'POST', path: '/api/v1/conversations/lifecycle-test/messages',
        headers: auth(), body: { content: 'hello' }
      })

      await new Promise(r => setTimeout(r, 20))
      handler.unsubscribe()

      // Should get a 5xx or connection error after unsubscribe
      const res = await sendPromise.catch(() => ({ status: 0 }))
      expect([0, 500, 504].includes(res.status)).toBe(true)

      // Re-subscribe so afterEach cleanup doesn't fail
      handler.subscribe(bus)
    })
  })
})
