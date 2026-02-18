#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Ensure npm-global binaries are in PATH (daemon/systemd don't source .bashrc)
const npmGlobalBin = join(homedir(), '.npm-global', 'bin')
if (existsSync(npmGlobalBin) && !process.env.PATH?.includes(npmGlobalBin)) {
  process.env.PATH = `${npmGlobalBin}:${process.env.PATH}`
}

import config from './infrastructure/config.js'
import logger from './infrastructure/logger.js'
import paths from './infrastructure/paths.js'
// Provider self-registration: importing triggers registerProvider()
import './adapters/providers/mock.js'
import './adapters/providers/claude-cli.js'
import './adapters/providers/claude-api.js'
import './adapters/providers/gemini-cli.js'
import './adapters/providers/gemini-api.js'
import './adapters/providers/cerebras-api.js'
import './adapters/providers/codex-cli.js'
import { createProvider } from './adapters/providers/registry.js'
import { createApp } from './app.js'

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
  allowedUsers: config.telegram.allowedUsers.length,
  allowedChats: config.telegram.allowedChatIds.length
})

// Initialize provider from registry (providers self-register on import)
let provider
try {
  provider = createProvider(config.provider, config)
  if (config.provider === 'mock') logger.warn('system', 'mock_provider_active')
} catch (error) {
  logger.error('system', 'unknown_provider', { provider: config.provider, error: error.message })
  process.exit(1)
}

// Create app instance
let app
try {
  app = createApp(config, provider, { homePath: paths.home })
} catch (error) {
  logger.error('system', 'app_create_failed', { error: error.message })
  process.exit(1)
}

// Graceful shutdown
async function shutdown(signal) {
  logger.info('system', 'shutdown', { signal })
  await app.stop()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Start
app.start().catch(error => {
  logger.error('system', 'startup_failed', { error: error.message })
  process.exit(1)
})
