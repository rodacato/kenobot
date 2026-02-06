#!/usr/bin/env node

import config from './config.js'
import bus from './bus.js'
import TelegramChannel from './channels/telegram.js'
import ClaudeCLIProvider from './providers/claude-cli.js'

/**
 * KenoBot - Phase 0: Prototype
 *
 * Goal: Prove the core loop works
 * - Telegram message comes in
 * - Pass to Claude CLI
 * - Send response back
 *
 * No agent, no context, no memory yet.
 * Just the basic wiring.
 */

console.log('🤖 KenoBot starting...')
console.log(`   Provider: ${config.provider}`)
console.log(`   Model: ${config.model}`)
console.log(`   Allowed chat IDs: ${config.telegram.allowedChatIds.join(', ')}`)
console.log()

// Initialize provider
const provider = new ClaudeCLIProvider(config)

// Initialize channel
const telegram = new TelegramChannel(bus, {
  token: config.telegram.token,
  allowFrom: config.telegram.allowedChatIds
})

// Simple message handler (Phase 0 - no agent yet)
bus.on('message:in', async (message) => {
  console.log(`[message:in] ${message.userId}: ${message.text}`)

  try {
    // Call provider
    const response = await provider.chat([
      { role: 'user', content: message.text }
    ])

    console.log(`[claude] Response: ${response.content.slice(0, 100)}...`)

    // Publish response to bus
    bus.emit('message:out', {
      chatId: message.chatId,
      text: response.content,
      channel: message.channel
    })
  } catch (error) {
    console.error('[error] Failed to process message:', error.message)

    // Send error to user
    bus.emit('message:out', {
      chatId: message.chatId,
      text: `Error: ${error.message}`,
      channel: message.channel
    })
  }
})

// Error handler
bus.on('error', ({ source, error, context }) => {
  console.error(`[error] ${source}:`, error, context)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[shutdown] SIGTERM received, shutting down gracefully...')
  await telegram.stop()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('\n[shutdown] SIGINT received, shutting down gracefully...')
  await telegram.stop()
  process.exit(0)
})

// Start the bot
telegram.start().catch(error => {
  console.error('[fatal] Failed to start bot:', error.message)
  process.exit(1)
})
