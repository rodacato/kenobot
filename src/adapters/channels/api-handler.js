import crypto from 'node:crypto'
import { readdir, stat, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { URL } from 'node:url'
import { MESSAGE_IN, MESSAGE_OUT } from '../../infrastructure/events.js'
import defaultLogger from '../../infrastructure/logger.js'
import { validateBearer, checkRateLimit, extractIp } from './api-auth.js'
import { createRouter, pathToRegex } from './api-router.js'

/**
 * APIHandler — Generic REST API for KenoBot.
 *
 * Not a channel — mounted on HTTPChannel via delegation in _route().
 * All 20 endpoints across 7 groups: discovery, health/stats, conversations,
 * memory, scheduler, sleep cycle, tasks.
 *
 * Auth: Bearer API key (Authorization: Bearer kb-xxx).
 * Rate limiting: sliding window per IP.
 * Session IDs: api-{chatId} (resolves to data/sessions/api-{id}.jsonl).
 */
export default class APIHandler {
  constructor({
    bus, apiKey, storage, memory, scheduler, sleepCycle,
    agent, taskStore, costTracker, stats, logger,
    timeout, rateLimit, corsOrigin, distPath,
  }) {
    this._bus = bus
    this._apiKey = apiKey
    this._storage = storage
    this._memory = memory
    this._scheduler = scheduler
    this._sleepCycle = sleepCycle
    this._agent = agent
    this._taskStore = taskStore
    this._costTracker = costTracker
    this._stats = stats
    this._logger = logger || defaultLogger
    this._timeout = timeout || 120_000
    this._rateLimit = rateLimit || 60
    this._corsOrigin = corsOrigin || '*'
    this._distPath = distPath || ''

    this._pendingRequests = new Map()  // requestId → { resolve, reject, timeout, chatId }
    this._activeChats = new Set()      // concurrent message guard (→ 409)
    this._rateLimiter = new Map()      // ip → timestamps[]
    this._busHandler = null

    this._router = createRouter(this._buildRoutes())
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Subscribe to MESSAGE_OUT on the bus to resolve pending chat requests.
   * Called by HTTPChannel.start().
   */
  subscribe(bus) {
    this._busHandler = (msg) => this._handleBusResponse(msg)
    bus.on(MESSAGE_OUT, this._busHandler)
  }

  /**
   * Remove bus subscription. Called by HTTPChannel.stop().
   */
  unsubscribe() {
    if (this._busHandler && this._bus) {
      this._bus.off(MESSAGE_OUT, this._busHandler)
      this._busHandler = null
    }
    // Reject all pending chat requests
    for (const [, pending] of this._pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('server shutting down'))
    }
    this._pendingRequests.clear()
    this._activeChats.clear()
  }

  /**
   * Handle an incoming HTTP request delegated from HTTPChannel._route().
   */
  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    // CORS preflight
    if (req.method === 'OPTIONS') {
      this._addCors(res)
      res.writeHead(204)
      res.end()
      return
    }

    // Rate limiting (applied before auth — no key required to hit this)
    const ip = extractIp(req)
    const rl = checkRateLimit(ip, 60_000, this._rateLimit, this._rateLimiter)
    if (!rl.allowed) {
      this._addCors(res)
      return this._err(res, 429, 'RATE_LIMITED', 'Too many requests',
        `Limit is ${this._rateLimit} requests per minute. Wait ${rl.retryAfter}s and retry.`,
        true, { 'Retry-After': String(rl.retryAfter) })
    }

    // Route lookup
    const match = this._router(req.method, pathname)
    if (!match) {
      this._addCors(res)
      return this._err(res, 404, 'NOT_FOUND', 'Not found', `No route for ${req.method} ${pathname}`)
    }

    // Auth check (skip for public routes)
    if (match.handler.requiresAuth !== false) {
      if (!validateBearer(req, this._apiKey)) {
        this._addCors(res)
        return this._err(res, 401, 'UNAUTHORIZED', 'Invalid or missing API key',
          'Include Authorization: Bearer <your API key> header')
      }
    }

    try {
      await match.handler.call(this, req, res, match.params, url.searchParams)
    } catch (error) {
      this._logger.error('api', 'handler_error', { pathname, error: error.message })
      this._addCors(res)
      this._err(res, 500, 'INTERNAL_ERROR', 'Internal server error', error.message)
    }
  }

  // ─── Route table ──────────────────────────────────────────────────────────

  _buildRoutes() {
    const pub = (fn) => { fn.requiresAuth = false; return fn }

    return [
      { method: 'GET',    pattern: pathToRegex('/api/v1/'),                              handler: pub(this._handleIndex) },
      { method: 'GET',    pattern: pathToRegex('/api/v1/health'),                        handler: pub(this._handleHealth) },
      { method: 'GET',    pattern: pathToRegex('/api/v1/stats'),                         handler: this._handleStats },
      { method: 'GET',    pattern: pathToRegex('/api/v1/conversations'),                 handler: this._handleListConversations },
      { method: 'POST',   pattern: pathToRegex('/api/v1/conversations'),                 handler: this._handleCreateConversation },
      { method: 'GET',    pattern: pathToRegex('/api/v1/conversations/:id'),             handler: this._handleGetConversation },
      { method: 'GET',    pattern: pathToRegex('/api/v1/conversations/:id/messages'),    handler: this._handleGetMessages },
      { method: 'POST',   pattern: pathToRegex('/api/v1/conversations/:id/messages'),    handler: this._handleSendMessage },
      { method: 'DELETE', pattern: pathToRegex('/api/v1/conversations/:id'),             handler: this._handleDeleteConversation },
      { method: 'GET',    pattern: pathToRegex('/api/v1/memory'),                        handler: this._handleGetMemory },
      { method: 'GET',    pattern: pathToRegex('/api/v1/memory/recent'),                 handler: this._handleGetMemoryRecent },
      { method: 'GET',    pattern: pathToRegex('/api/v1/memory/working/:sessionId'),     handler: this._handleGetWorkingMemory },
      { method: 'GET',    pattern: pathToRegex('/api/v1/memory/patterns'),               handler: this._handleGetPatterns },
      { method: 'GET',    pattern: pathToRegex('/api/v1/scheduler'),                     handler: this._handleListScheduler },
      { method: 'POST',   pattern: pathToRegex('/api/v1/scheduler'),                     handler: this._handleCreateSchedulerTask },
      { method: 'DELETE', pattern: pathToRegex('/api/v1/scheduler/:id'),                 handler: this._handleDeleteSchedulerTask },
      { method: 'GET',    pattern: pathToRegex('/api/v1/sleep-cycle'),                   handler: this._handleGetSleepCycle },
      { method: 'POST',   pattern: pathToRegex('/api/v1/sleep-cycle/run'),               handler: this._handleRunSleepCycle },
      { method: 'GET',    pattern: pathToRegex('/api/v1/tasks/active'),                  handler: this._handleGetActiveTasks },
      { method: 'GET',    pattern: pathToRegex('/api/v1/tasks/:id/events'),              handler: this._handleGetTaskEvents },
    ]
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  async _handleIndex(req, res) {
    this._ok(res, {
      version: 'v1',
      endpoints: [
        'GET  /api/v1/',
        'GET  /api/v1/health',
        'GET  /api/v1/stats',
        'GET  /api/v1/conversations',
        'POST /api/v1/conversations',
        'GET  /api/v1/conversations/:id',
        'GET  /api/v1/conversations/:id/messages',
        'POST /api/v1/conversations/:id/messages',
        'DELETE /api/v1/conversations/:id',
        'GET  /api/v1/memory',
        'GET  /api/v1/memory/recent',
        'GET  /api/v1/memory/working/:sessionId',
        'GET  /api/v1/memory/patterns',
        'GET  /api/v1/scheduler',
        'POST /api/v1/scheduler',
        'DELETE /api/v1/scheduler/:id',
        'GET  /api/v1/sleep-cycle',
        'POST /api/v1/sleep-cycle/run',
        'GET  /api/v1/tasks/active',
        'GET  /api/v1/tasks/:id/events',
      ],
      auth: 'Authorization: Bearer <API_KEY> (all except /health and /)',
    })
  }

  async _handleHealth(req, res) {
    this._ok(res, { status: 'ok', timestamp: Date.now() })
  }

  async _handleStats(req, res) {
    const data = this._stats ? this._stats() : {}
    this._ok(res, data)
  }

  async _handleListConversations(req, res, params, query) {
    const sessionsDir = join(this._storage.sessionsDir || this._storage.dataDir || './data', 'sessions')
    let files
    try {
      const all = await readdir(sessionsDir)
      files = all.filter(f => f.startsWith('api-') && f.endsWith('.jsonl'))
    } catch {
      return this._ok(res, { conversations: [] })
    }

    const conversations = await Promise.all(files.map(async (file) => {
      const filePath = join(sessionsDir, file)
      const id = file.replace(/^api-/, '').replace(/\.jsonl$/, '')
      let title = ''
      let messageCount = 0
      let createdAt = 0
      let updatedAt = 0

      try {
        const [content, fileStat] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)])
        const lines = content.trim().split('\n').filter(Boolean)
        messageCount = lines.length

        // Title from first user message
        for (const line of lines) {
          try {
            const msg = JSON.parse(line)
            if (msg.role === 'user' && msg.content) {
              title = msg.content.slice(0, 60)
              break
            }
          } catch { /* skip */ }
        }

        createdAt = fileStat.birthtimeMs || fileStat.ctimeMs || 0
        updatedAt = fileStat.mtimeMs || 0
      } catch { /* skip unreadable files */ }

      return { id, title, messageCount, createdAt, updatedAt }
    }))

    conversations.sort((a, b) => b.updatedAt - a.updatedAt)
    this._ok(res, { conversations })
  }

  async _handleCreateConversation(req, res) {
    let body = {}
    try {
      body = await this._readBody(req)
    } catch {
      return this._err(res, 400, 'INVALID_BODY', 'Failed to read request body')
    }

    const id = body.id || crypto.randomUUID()
    this._ok(res, { id }, 201)
  }

  async _handleGetConversation(req, res, { id }) {
    const sessionId = `api-${id}`
    let messages = []
    try {
      messages = await this._storage.loadSession(sessionId, 1000)
    } catch {
      return this._err(res, 404, 'NOT_FOUND', `Conversation ${id} not found`)
    }

    const title = messages.find(m => m.role === 'user')?.content?.slice(0, 60) || ''
    this._ok(res, {
      id,
      title,
      messageCount: messages.length,
      createdAt: messages[0]?.timestamp || 0,
      updatedAt: messages[messages.length - 1]?.timestamp || 0,
    })
  }

  async _handleGetMessages(req, res, { id }, query) {
    const sessionId = `api-${id}`
    const limit = Math.min(parseInt(query?.get('limit') || '50', 10), 200)

    let messages
    try {
      messages = await this._storage.loadSession(sessionId, limit)
    } catch {
      return this._err(res, 404, 'NOT_FOUND', `Conversation ${id} not found`)
    }

    this._ok(res, { messages })
  }

  async _handleSendMessage(req, res, { id }) {
    let body
    try {
      body = await this._readBody(req)
    } catch {
      return this._err(res, 400, 'INVALID_BODY', 'Failed to read request body')
    }

    if (!body.content || typeof body.content !== 'string') {
      return this._err(res, 400, 'MISSING_FIELD', 'content field is required and must be a string')
    }

    // Concurrent message guard
    if (this._activeChats.has(id)) {
      return this._err(res, 409, 'CONFLICT',
        'A message is already being processed for this conversation',
        'Wait for the current message to complete before sending another.', false)
    }

    // Budget check
    if (this._costTracker && !this._costTracker.isWithinBudget()) {
      return this._err(res, 429, 'BUDGET_EXCEEDED',
        'Daily or monthly budget exceeded', 'Check your budget limits in config.', true)
    }

    try {
      const text = await this._waitForResponse(id, body.content)
      this._ok(res, { role: 'assistant', content: text })
    } catch (error) {
      if (error.message === 'timeout') {
        return this._err(res, 504, 'GATEWAY_TIMEOUT',
          'Agent did not respond in time', 'The request timed out. Try again.', true)
      }
      throw error
    }
  }

  async _handleDeleteConversation(req, res, { id }) {
    const sessionId = `api-${id}`
    const sessionsDir = join(this._storage.sessionsDir || this._storage.dataDir || './data', 'sessions')
    const filePath = join(sessionsDir, `${sessionId}.jsonl`)

    try {
      await unlink(filePath)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return this._err(res, 404, 'NOT_FOUND', `Conversation ${id} not found`)
      }
      throw err
    }

    res.writeHead(204)
    res.end()
  }

  async _handleGetMemory(req, res) {
    const data = await this._memory.getLongTermMemory()
    this._ok(res, { memory: data })
  }

  async _handleGetMemoryRecent(req, res, params, query) {
    const days = Math.min(parseInt(query?.get('days') || '3', 10), 30)
    const data = await this._memory.getRecentDays(days)
    this._ok(res, { days, entries: data })
  }

  async _handleGetWorkingMemory(req, res, { sessionId }) {
    const data = await this._memory.working.get(sessionId)
    this._ok(res, { sessionId, memory: data })
  }

  async _handleGetPatterns(req, res) {
    const data = await this._memory.procedural.readPatterns()
    this._ok(res, { patterns: data })
  }

  async _handleListScheduler(req, res) {
    const tasks = this._scheduler.list()
    this._ok(res, { tasks })
  }

  async _handleCreateSchedulerTask(req, res) {
    let body
    try {
      body = await this._readBody(req)
    } catch {
      return this._err(res, 400, 'INVALID_BODY', 'Failed to read request body')
    }

    const { cronExpr, message, description } = body
    if (!cronExpr || !message) {
      return this._err(res, 400, 'MISSING_FIELD', 'cronExpr and message are required')
    }

    let taskId
    try {
      taskId = await this._scheduler.add({
        cronExpr, message, description: description || '',
        chatId: 'api-scheduled', userId: 'api', channel: 'telegram',
      })
    } catch (err) {
      return this._err(res, 400, 'INVALID_CRON', err.message, 'Provide a valid 5-field cron expression')
    }

    this._ok(res, { id: taskId }, 201)
  }

  async _handleDeleteSchedulerTask(req, res, { id }) {
    try {
      await this._scheduler.remove(id)
    } catch {
      return this._err(res, 404, 'NOT_FOUND', `Scheduler task ${id} not found`)
    }
    res.writeHead(204)
    res.end()
  }

  async _handleGetSleepCycle(req, res) {
    const state = this._sleepCycle.getState()
    this._ok(res, state)
  }

  async _handleRunSleepCycle(req, res) {
    this._sleepCycle.run().catch(err => {
      this._logger.error('api', 'sleep_cycle_run_failed', { error: err.message })
    })
    this._ok(res, { status: 'accepted', message: 'Sleep cycle triggered' }, 202)
  }

  async _handleGetActiveTasks(req, res) {
    const tasks = this._agent.getActiveTasks()
    this._ok(res, { tasks })
  }

  async _handleGetTaskEvents(req, res, { id }) {
    const events = await this._taskStore.loadEvents(id)
    this._ok(res, { taskId: id, events })
  }

  // ─── Chat bus bridge ──────────────────────────────────────────────────────

  /**
   * Fire message:in on bus and wait for message:out response.
   * Reuses the same pattern as HTTPChannel._waitForResponse().
   * @private
   */
  _waitForResponse(chatId, text) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      const timeout = setTimeout(() => {
        this._pendingRequests.delete(requestId)
        this._activeChats.delete(chatId)
        reject(new Error('timeout'))
      }, this._timeout)

      this._pendingRequests.set(requestId, { resolve, reject, timeout, chatId })
      this._activeChats.add(chatId)

      this._bus.fire(MESSAGE_IN, {
        text,
        chatId,
        userId: 'api',
        channel: 'api',
        timestamp: Date.now(),
      }, { source: 'api' })
    })
  }

  /**
   * Match MESSAGE_OUT events to pending chat requests.
   * @private
   */
  _handleBusResponse({ chatId, text, channel }) {
    if (channel !== 'api') return

    for (const [requestId, pending] of this._pendingRequests) {
      if (pending.chatId === chatId) {
        clearTimeout(pending.timeout)
        this._pendingRequests.delete(requestId)
        this._activeChats.delete(chatId)
        pending.resolve(text)
        return
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _ok(res, data, status = 200) {
    this._addCors(res)
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      data,
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }))
  }

  _err(res, status, code, message, hint = '', retryable = false, extraHeaders = {}) {
    this._addCors(res)
    res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders })
    res.end(JSON.stringify({
      error: { code, message, hint, retryable },
      meta: { requestId: crypto.randomUUID(), timestamp: Date.now() }
    }))
  }

  _addCors(res) {
    res.setHeader('Access-Control-Allow-Origin', this._corsOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()))
        } catch {
          resolve({})
        }
      })
      req.on('error', reject)
    })
  }
}
