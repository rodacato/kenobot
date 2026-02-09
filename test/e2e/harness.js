import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import crypto from 'node:crypto'
import http from 'node:http'
import { createConfig } from '../../src/config.js'
import { createApp } from '../../src/app.js'
import MockProvider from '../../src/providers/mock.js'

const WEBHOOK_SECRET = 'e2e-test-secret'

/**
 * Sign a request body with HMAC-SHA256.
 */
function sign(body) {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  return `sha256=${hmac}`
}

/**
 * Send an HTTP request to the test server.
 */
function httpRequest(port, { method = 'POST', path = '/webhook', body, headers = {} }) {
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

/**
 * Create and start a fully-wired test app with mock provider + HTTP channel.
 *
 * Returns helpers:
 *   - sendMessage(text, chatId?) — signed POST to /webhook, returns { status, body }
 *   - getHealth() — GET /health
 *   - sendRaw(body, headers) — raw POST for custom scenarios
 *   - port — HTTP port
 *   - app — full app object (bus, agent, storage, etc.)
 *   - dataDir — temp data directory
 *   - cleanup() — stop app + remove temp dir
 */
export async function createTestApp(overrides = {}, { setup } = {}) {
  // Create temp directories
  const dataDir = await mkdtemp(join(tmpdir(), 'kenobot-e2e-'))
  const identityDir = join(dataDir, 'identities', 'test')
  const skillsDir = join(dataDir, 'skills')
  const sessionsDir = join(dataDir, 'sessions')

  await mkdir(identityDir, { recursive: true })
  await mkdir(skillsDir, { recursive: true })
  await mkdir(sessionsDir, { recursive: true })

  // Write minimal identity file
  await writeFile(join(identityDir, 'SOUL.md'), '# Test Bot\nYou are a test bot.')
  await writeFile(join(identityDir, 'IDENTITY.md'), '# Identity\nTest identity.')

  // Optional pre-start setup (e.g. create skill dirs, BOOTSTRAP.md)
  if (setup) {
    await setup({ dataDir, identityDir, skillsDir, sessionsDir })
  }

  // Build config
  const { config } = createConfig({
    PROVIDER: 'mock',
    MODEL: 'test',
    DATA_DIR: dataDir,
    IDENTITY_FILE: identityDir,
    SKILLS_DIR: skillsDir,
    TELEGRAM_BOT_TOKEN: 'fake-token',
    TELEGRAM_ALLOWED_USERS: 'e2e-user',
    HTTP_ENABLED: 'true',
    HTTP_PORT: '0',
    HTTP_HOST: '127.0.0.1',
    WEBHOOK_SECRET,
    HTTP_TIMEOUT: '10000',
    MAX_TOOL_ITERATIONS: '5',
    WATCHDOG_INTERVAL: '60000',
    ...overrides
  })

  // Create mock provider and app
  const provider = new MockProvider(config)
  const app = createApp(config, provider, { homePath: dataDir })

  // Start the app
  await app.start()

  // Find the HTTP channel and its port
  const httpChannel = app.channels.find(ch => ch.name === 'http')
  const port = httpChannel.server.address().port

  /**
   * Send a signed message to the webhook.
   */
  async function sendMessage(text, chatId) {
    const payload = { message: text }
    if (chatId) payload.chat_id = chatId
    const bodyStr = JSON.stringify(payload)

    return httpRequest(port, {
      body: bodyStr,
      headers: { 'X-Webhook-Signature': sign(bodyStr) }
    })
  }

  /**
   * Send a raw POST (for testing auth rejection, bad payloads, etc.)
   */
  async function sendRaw(body, headers = {}) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    return httpRequest(port, { body: bodyStr, headers })
  }

  /**
   * GET /health endpoint.
   */
  async function getHealth() {
    return httpRequest(port, { method: 'GET', path: '/health' })
  }

  /**
   * Stop app and clean up temp directory.
   */
  async function cleanup() {
    await app.stop()
    await rm(dataDir, { recursive: true, force: true })
  }

  return { app, port, dataDir, sendMessage, sendRaw, getHealth, cleanup, provider }
}
