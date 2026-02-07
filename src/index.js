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

// Configure logger with data directory for JSONL file output
logger.configure({ dataDir: config.dataDir })

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

// Initialize tool registry
const toolRegistry = new ToolRegistry()
toolRegistry.register(new WebFetchTool())
if (config.n8n.webhookBase) {
  toolRegistry.register(new N8nTriggerTool(config.n8n))
}
logger.info('system', 'tools_registered', { count: toolRegistry.size })

// Initialize storage, memory, and agent
const storage = new FilesystemStorage(config)
const memory = new MemoryManager(config.dataDir)
const contextBuilder = new ContextBuilder(config, storage, memory, toolRegistry)
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
  agent.stop()
  await Promise.all(channels.map(ch => ch.stop()))
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Start the agent and all channels
async function start() {
  await agent.start()
  await Promise.all(channels.map(ch => ch.start()))
}

start().catch(error => {
  logger.error('system', 'startup_failed', { error: error.message })
  process.exit(1)
})
