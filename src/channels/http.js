import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import BaseChannel from './base.js'
import { MESSAGE_IN, MESSAGE_OUT } from '../events.js'
// logger inherited from BaseChannel via this.logger
import { getStatus } from '../health.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(join(__dirname, '..', '..', 'package.json'), 'utf8'))

/**
 * HTTPChannel - Webhook endpoint for external integrations (n8n, curl, etc.)
 *
 * Receives POST /webhook with HMAC-SHA256 signature validation.
 * Returns agent response synchronously in the HTTP response body.
 * Also serves GET /health for monitoring.
 *
 * Two session modes:
 * - Transient (no chat_id): each request is standalone, no history
 * - Persistent (with chat_id): maintains conversation history across requests
 */
export default class HTTPChannel extends BaseChannel {
  constructor(bus, config) {
    super(bus, config)
    this.server = null
    this._pendingRequests = new Map()
    this._responseHandler = null
  }

  get name() { return 'http' }

  async start() {
    this._responseHandler = (msg) => this._handleBusResponse(msg)
    this.bus.on(MESSAGE_OUT, this._responseHandler)

    this.server = createServer((req, res) => this._route(req, res))

    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.config.port, this.config.host, () => {
        this.server.removeListener('error', reject)
        resolve()
      })
    })

    this.logger.info('http', 'started', { port: this.config.port, host: this.config.host })
  }

  async stop() {
    if (this._responseHandler) {
      this.bus.off(MESSAGE_OUT, this._responseHandler)
      this._responseHandler = null
    }

    for (const [, pending] of this._pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('server shutting down'))
    }
    this._pendingRequests.clear()

    if (this.server) {
      await new Promise(resolve => this.server.close(resolve))
      this.server = null
    }

    this.logger.info('http', 'stopped')
  }

  // HMAC validation replaces userId allowlist for HTTP channel
  _isAllowed() { return true }

  /**
   * Route incoming HTTP requests.
   * @private
   */
  _route(req, res) {
    if (req.method === 'GET' && req.url === '/') {
      return this._handleIndex(res)
    }
    if (req.method === 'GET' && req.url === '/health') {
      return this._handleHealth(res)
    }
    if (req.method === 'POST' && req.url === '/webhook') {
      return this._handleWebhook(req, res)
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  }

  /**
   * Handle POST /webhook — validate, process, return agent response.
   * @private
   */
  async _handleWebhook(req, res) {
    let rawBody
    try {
      rawBody = await this._readBody(req)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'failed to read body' }))
    }

    // Validate HMAC signature
    const signature = req.headers['x-webhook-signature']
    if (!this._validateSignature(rawBody, signature)) {
      this.logger.warn('http', 'auth_rejected', { reason: 'invalid signature' })
      res.writeHead(401, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'invalid signature' }))
    }

    // Parse JSON
    let data
    try {
      data = JSON.parse(rawBody)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'invalid json' }))
    }

    if (!data.message || typeof data.message !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'missing message field' }))
    }

    const requestId = crypto.randomUUID()
    const chatId = data.chat_id ? `http-${data.chat_id}` : requestId

    this.logger.info('http', 'webhook_received', { requestId, chatId, length: data.message.length })

    try {
      const responseText = await this._waitForResponse(requestId, chatId, data.message)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ response: responseText, status: 'ok' }))
    } catch (error) {
      const statusCode = error.message === 'timeout' ? 408 : 500
      this.logger.error('http', 'webhook_failed', { requestId, error: error.message })
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message, status: 'error' }))
    }
  }

  /**
   * Publish message to bus and wait for agent response.
   * @private
   */
  _waitForResponse(requestId, chatId, text) {
    return new Promise((resolve, reject) => {
      const timeoutMs = this.config.timeout || 60_000
      const timeout = setTimeout(() => {
        this._pendingRequests.delete(requestId)
        reject(new Error('timeout'))
      }, timeoutMs)

      this._pendingRequests.set(requestId, { resolve, reject, timeout, chatId })

      this.bus.fire(MESSAGE_IN, {
        text,
        chatId,
        userId: 'webhook',
        channel: this.name,
        timestamp: Date.now()
      }, { source: 'http' })
    })
  }

  /**
   * Match bus message:out events to pending HTTP requests.
   * @private
   */
  _handleBusResponse({ chatId, text, channel }) {
    if (channel !== this.name) return

    for (const [requestId, pending] of this._pendingRequests) {
      if (pending.chatId === chatId) {
        clearTimeout(pending.timeout)
        this._pendingRequests.delete(requestId)
        pending.resolve(text)
        return
      }
    }
  }

  /**
   * Validate HMAC-SHA256 signature.
   * @private
   */
  _validateSignature(body, signature) {
    if (!signature || !this.config.webhookSecret) return false
    const expected = 'sha256=' + crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(body)
      .digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    } catch {
      return false
    }
  }

  /**
   * GET / — public welcome page.
   * @private
   */
  _handleIndex(res) {
    const uptime = Math.floor(process.uptime())
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const mins = Math.floor((uptime % 3600) / 60)
    const uptimeStr = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KenoBot</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0a0a0a;
    color: #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .card {
    text-align: center;
    padding: 3rem 2.5rem;
    border: 1px solid #222;
    border-radius: 12px;
    background: #111;
    max-width: 360px;
    width: 90%;
  }
  .logo { font-size: 2.5rem; margin-bottom: 0.5rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
  .tagline { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #0d1f0d;
    border: 1px solid #1a3a1a;
    padding: 0.4rem 1rem;
    border-radius: 999px;
    font-size: 0.8rem;
    color: #4ade80;
  }
  .dot {
    width: 8px; height: 8px;
    background: #4ade80;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .meta {
    margin-top: 1.5rem;
    font-size: 0.75rem;
    color: #555;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">&#129302;</div>
  <h1>KenoBot</h1>
  <p class="tagline">AI Assistant</p>
  <div class="status"><span class="dot"></span> Online &middot; ${uptimeStr}</div>
  <p class="meta">v${pkg.version}</p>
</div>
</body>
</html>`

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  /**
   * GET /health — monitoring endpoint.
   * @private
   */
  _handleHealth(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getStatus()))
  }

  /**
   * Read full request body as string.
   * @private
   */
  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString()))
      req.on('error', reject)
    })
  }
}
