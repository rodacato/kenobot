#!/usr/bin/env node

import config from './config.js'
import logger from './logger.js'
import bus from './bus.js'
import TelegramChannel from './channels/telegram.js'
import ClaudeCLIProvider from './providers/claude-cli.js'
import ClaudeAPIProvider from './providers/claude-api.js'
import MockProvider from './providers/mock.js'
import FilesystemStorage from './storage/filesystem.js'
import MemoryManager from './agent/memory.js'
import ContextBuilder from './agent/context.js'
import AgentLoop from './agent/loop.js'

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

// Initialize storage, memory, and agent
const storage = new FilesystemStorage(config)
const memory = new MemoryManager(config.dataDir)
const contextBuilder = new ContextBuilder(config, storage, memory)
const agent = new AgentLoop(bus, provider, contextBuilder, storage, memory)

// Initialize channel
const telegram = new TelegramChannel(bus, {
  token: config.telegram.token,
  allowFrom: config.telegram.allowedChatIds
})

// Error handler
bus.on('error', ({ source, error, context }) => {
  logger.error('bus', 'event_error', {
    source,
    error: typeof error === 'string' ? error : error?.message || String(error)
  })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('system', 'shutdown', { signal: 'SIGTERM' })
  agent.stop()
  await telegram.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('system', 'shutdown', { signal: 'SIGINT' })
  agent.stop()
  await telegram.stop()
  process.exit(0)
})

// Start the bot and agent
async function start() {
  await agent.start()
  await telegram.start()
}

start().catch(error => {
  logger.error('system', 'startup_failed', { error: error.message })
  process.exit(1)
})
