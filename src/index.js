#!/usr/bin/env node

import config from './config.js'
import logger from './logger.js'
import bus from './bus.js'
import TelegramChannel from './channels/telegram.js'
import ClaudeCLIProvider from './providers/claude-cli.js'
import ClaudeAPIProvider from './providers/claude-api.js'
import MockProvider from './providers/mock.js'

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

// Initialize channel
const telegram = new TelegramChannel(bus, {
  token: config.telegram.token,
  allowFrom: config.telegram.allowedChatIds
})

// Simple message handler (Phase 0 - no agent yet)
bus.on('message:in', async (message) => {
  logger.info('telegram', 'message_received', {
    userId: message.userId,
    chatId: message.chatId,
    length: message.text.length
  })

  // Show typing indicator while waiting for provider
  const typingPayload = { chatId: message.chatId, channel: message.channel }
  bus.emit('thinking:start', typingPayload)
  const typingInterval = setInterval(() => bus.emit('thinking:start', typingPayload), 4000)

  try {
    const start = Date.now()
    const response = await provider.chat([
      { role: 'user', content: message.text }
    ])
    clearInterval(typingInterval)

    logger.info(config.provider, 'response_received', {
      durationMs: Date.now() - start,
      contentLength: response.content.length
    })

    bus.emit('message:out', {
      chatId: message.chatId,
      text: response.content,
      channel: message.channel
    })
  } catch (error) {
    clearInterval(typingInterval)

    logger.error('system', 'message_processing_failed', {
      error: error.message,
      chatId: message.chatId
    })

    bus.emit('message:out', {
      chatId: message.chatId,
      text: `Error: ${error.message}`,
      channel: message.channel
    })
  }
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
  await telegram.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('system', 'shutdown', { signal: 'SIGINT' })
  await telegram.stop()
  process.exit(0)
})

// Start the bot
telegram.start().catch(error => {
  logger.error('system', 'startup_failed', { error: error.message })
  process.exit(1)
})
