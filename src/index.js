#!/usr/bin/env node

import config from './config.js'
import logger from './logger.js'
import bus from './bus.js'
import TelegramChannel from './channels/telegram.js'
import HTTPChannel from './channels/http.js'
import ClaudeCLIProvider from './providers/claude-cli.js'
import ClaudeAPIProvider from './providers/claude-api.js'
import MockProvider from './providers/mock.js'
import FilesystemStorage from './storage/filesystem.js'
import MemoryManager from './agent/memory.js'
import IdentityLoader from './agent/identity.js'
import ContextBuilder from './agent/context.js'
import AgentLoop from './agent/loop.js'
import ToolRegistry from './tools/registry.js'
import ToolLoader from './tools/loader.js'
import SkillLoader from './skills/loader.js'
import Scheduler from './scheduler/scheduler.js'
import CircuitBreakerProvider from './providers/circuit-breaker.js'
import Watchdog from './watchdog.js'
import ConfigSync from './config-sync.js'
import { initWorkspace } from './workspace.js'
import { writePid, removePid } from './health.js'
import { setupNotifications } from './notifications.js'
import paths from './paths.js'

// Configure logger with data directory for JSONL file output
logger.configure({ dataDir: config.dataDir })

// Error boundaries — log but don't crash on transient errors
process.on('uncaughtException', (error) => {
  logger.error('system', 'uncaught_exception', { error: error.message, stack: error.stack })
})
process.on('unhandledRejection', (reason) => {
  logger.error('system', 'unhandled_rejection', { error: String(reason) })
})

logger.info('system', 'startup', {
  provider: config.provider,
  model: config.model,
  allowedChats: config.telegram.allowedChatIds.length
})

// Initialize provider based on config
let provider
switch (config.provider) {
  case 'mock':
    provider = new MockProvider(config)
    logger.warn('system', 'mock_provider_active')
    break
  case 'claude-cli':
    provider = new ClaudeCLIProvider(config)
    break
  case 'claude-api':
    provider = new ClaudeAPIProvider(config)
    break
  default:
    logger.error('system', 'unknown_provider', { provider: config.provider })
    process.exit(1)
}

// Wrap provider with circuit breaker
const circuitBreaker = new CircuitBreakerProvider(provider, config.circuitBreaker)
provider = circuitBreaker

// Initialize watchdog
const watchdog = new Watchdog(bus, { interval: config.watchdogInterval })

// Register provider health check
watchdog.registerCheck('provider', () => {
  const status = circuitBreaker.getStatus()
  if (status.state === 'OPEN') return { status: 'fail', detail: `circuit OPEN, ${status.failures} failures` }
  if (status.state === 'HALF_OPEN') return { status: 'warn', detail: 'circuit recovering' }
  return { status: 'ok', detail: `${status.failures} recent failures` }
}, { critical: true })

// Register memory health check
watchdog.registerCheck('memory', () => {
  const mb = Math.floor(process.memoryUsage().rss / 1024 / 1024)
  if (mb > 512) return { status: 'fail', detail: `${mb}MB RSS (>512MB)` }
  if (mb > 256) return { status: 'warn', detail: `${mb}MB RSS (>256MB)` }
  return { status: 'ok', detail: `${mb}MB RSS` }
})

// Register n8n health check (if configured)
if (config.n8n.apiUrl) {
  watchdog.registerCheck('n8n', async () => {
    try {
      const res = await fetch(`${config.n8n.apiUrl}/healthz`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) return { status: 'ok', detail: 'n8n reachable' }
      return { status: 'fail', detail: `n8n returned ${res.status}` }
    } catch (error) {
      return { status: 'fail', detail: `n8n unreachable: ${error.message}` }
    }
  })
}

// Route health + approval events to owner's Telegram
setupNotifications(bus, config)

// Initialize config-sync (no-ops if CONFIG_REPO is not set)
const configSync = new ConfigSync(paths.home, {
  repoUrl: config.configRepo,
  sshKeyPath: config.sshKeyPath
})

bus.on('config:changed', ({ reason }) => {
  configSync.schedule(reason)
})

bus.on('approval:approved', () => {
  configSync.schedule('approval activated')
})

// Initialize scheduler (loadTasks is async, called in start())
const scheduler = new Scheduler(bus, config.dataDir)

// Initialize storage and memory
const storage = new FilesystemStorage(config)
const memory = new MemoryManager(config.dataDir)

// Initialize identity loader (modular SOUL.md + IDENTITY.md + USER.md)
const identityLoader = new IdentityLoader(config.identityFile)

// Initialize skill loader (loadAll is async, called in start())
const skillLoader = new SkillLoader(config.skillsDir)

// Initialize tool registry + loader (auto-discovers src/tools/*.js)
const toolRegistry = new ToolRegistry()
const toolLoader = new ToolLoader(toolRegistry, {
  config, scheduler, watchdog, circuitBreaker, bus, skillLoader, identityLoader
})

const contextBuilder = new ContextBuilder(config, storage, memory, toolRegistry, skillLoader, identityLoader)
const agent = new AgentLoop(bus, provider, contextBuilder, storage, memory, toolRegistry)
agent.maxToolIterations = config.maxToolIterations

// Initialize channels
const channels = []

const telegram = new TelegramChannel(bus, {
  token: config.telegram.token,
  allowFrom: config.telegram.allowedChatIds
})
channels.push(telegram)

// HTTP channel (opt-in)
if (config.http.enabled) {
  if (!config.http.webhookSecret) {
    logger.error('system', 'config_missing', { key: 'WEBHOOK_SECRET', hint: 'required when HTTP_ENABLED=true' })
    process.exit(1)
  }
  const httpChannel = new HTTPChannel(bus, config.http)
  channels.push(httpChannel)
}

// Error handler
bus.on('error', ({ source, error, context }) => {
  logger.error('bus', 'event_error', {
    source,
    error: typeof error === 'string' ? error : error?.message || String(error)
  })
})

// Graceful shutdown
async function shutdown(signal) {
  logger.info('system', 'shutdown', { signal })
  await removePid()
  await toolLoader.stop()
  watchdog.stop()
  scheduler.stop()
  agent.stop()
  await configSync.flush()
  configSync.stop()
  await Promise.all(channels.map(ch => ch.stop()))
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Start the agent and all channels
async function start() {
  await writePid()

  // Initialize workspace (if configured)
  if (config.workspaceDir) {
    await initWorkspace(config.workspaceDir, { sshKeyPath: config.sshKeyPath })
    logger.info('system', 'workspace_initialized', { dir: config.workspaceDir })
  }

  await toolLoader.loadAll()

  await skillLoader.loadAll()
  logger.info('system', 'skills_loaded', { count: skillLoader.size })

  await scheduler.loadTasks()
  logger.info('system', 'scheduler_loaded', { tasks: scheduler.size })

  await configSync.init()

  await agent.start()
  await Promise.all(channels.map(ch => ch.start()))
  watchdog.start()
}

start().catch(error => {
  logger.error('system', 'startup_failed', { error: error.message })
  process.exit(1)
})
