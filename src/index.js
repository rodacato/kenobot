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
import ContextBuilder from './agent/context.js'
import AgentLoop from './agent/loop.js'
import ToolRegistry from './tools/registry.js'
import WebFetchTool from './tools/web-fetch.js'
import N8nTriggerTool from './tools/n8n.js'
import SkillLoader from './skills/loader.js'
import Scheduler from './scheduler/scheduler.js'
import ScheduleTool from './tools/schedule.js'
import CircuitBreakerProvider from './providers/circuit-breaker.js'
import Watchdog from './watchdog.js'
import DiagnosticsTool from './tools/diagnostics.js'
import WorkspaceTool from './tools/workspace.js'
import GitHubTool from './tools/github.js'
import ApprovalTool from './tools/approval.js'
import N8nManageTool from './tools/n8n-manage.js'
import { initWorkspace } from './workspace.js'
import { writePid, removePid } from './health.js'

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

// Health event → alert owner via Telegram
bus.on('health:degraded', ({ detail }) => {
  const ownerChat = config.telegram.allowedChatIds[0]
  if (ownerChat) {
    bus.emit('message:out', { chatId: ownerChat, text: `Health degraded: ${detail}`, channel: 'telegram' })
  }
})

bus.on('health:unhealthy', ({ detail }) => {
  const ownerChat = config.telegram.allowedChatIds[0]
  if (ownerChat) {
    bus.emit('message:out', { chatId: ownerChat, text: `UNHEALTHY: ${detail}`, channel: 'telegram' })
  }
})

bus.on('health:recovered', ({ previous }) => {
  const ownerChat = config.telegram.allowedChatIds[0]
  if (ownerChat) {
    bus.emit('message:out', { chatId: ownerChat, text: `Recovered (was ${previous})`, channel: 'telegram' })
  }
})

// Approval events → notify owner
bus.on('approval:proposed', ({ id, type, name }) => {
  const ownerChat = config.telegram.allowedChatIds[0]
  if (ownerChat) {
    bus.emit('message:out', {
      chatId: ownerChat,
      text: `New proposal: [${type}] ${name} (ID: ${id})\nUse /approve ${id} or /reject ${id}`,
      channel: 'telegram'
    })
  }
})

// Initialize scheduler (loadTasks is async, called in start())
const scheduler = new Scheduler(bus, config.dataDir)

// Initialize tool registry
const toolRegistry = new ToolRegistry()
toolRegistry.register(new WebFetchTool())
toolRegistry.register(new ScheduleTool(scheduler))
toolRegistry.register(new DiagnosticsTool(watchdog, circuitBreaker))
if (config.workspaceDir) {
  toolRegistry.register(new WorkspaceTool(config.workspaceDir))
  toolRegistry.register(new GitHubTool(config.workspaceDir))
}
if (config.n8n.webhookBase) {
  toolRegistry.register(new N8nTriggerTool(config.n8n))
}
if (config.n8n.apiUrl && config.n8n.apiKey) {
  toolRegistry.register(new N8nManageTool(config.n8n))
}
for (const def of toolRegistry.getDefinitions()) {
  const tool = toolRegistry.tools.get(def.name)
  const trigger = tool.trigger ? String(tool.trigger) : 'none'
  logger.info('system', 'tool_loaded', { name: def.name, trigger })
}
logger.info('system', 'tools_registered', { count: toolRegistry.size })

// Initialize storage and memory
const storage = new FilesystemStorage(config)
const memory = new MemoryManager(config.dataDir)

// Initialize skill loader (loadAll is async, called in start())
const skillLoader = new SkillLoader(config.skillsDir)

// Register approval tool (needs skillLoader)
if (config.workspaceDir && config.selfImprovementEnabled) {
  toolRegistry.register(new ApprovalTool(config.workspaceDir, bus, { skillLoader }))
}

const contextBuilder = new ContextBuilder(config, storage, memory, toolRegistry, skillLoader)
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
  watchdog.stop()
  scheduler.stop()
  agent.stop()
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
    await initWorkspace(config.workspaceDir)
    logger.info('system', 'workspace_initialized', { dir: config.workspaceDir })
  }

  await skillLoader.loadAll()
  logger.info('system', 'skills_loaded', { count: skillLoader.size })

  await scheduler.loadTasks()
  logger.info('system', 'scheduler_loaded', { tasks: scheduler.size })

  await agent.start()
  await Promise.all(channels.map(ch => ch.start()))
  watchdog.start()
}

start().catch(error => {
  logger.error('system', 'startup_failed', { error: error.message })
  process.exit(1)
})
