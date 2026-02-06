import { config as loadEnv } from 'dotenv'
import { parseArgs } from 'node:util'
import logger from './logger.js'

// Parse command line arguments
const { values } = parseArgs({
  options: {
    config: { type: 'string', default: '.env' }
  },
  strict: false
})

// Load environment variables from specified config file
// Use override: true to override any existing env vars (important in containers)
loadEnv({ path: values.config, override: true })

// Validate required config
const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS']
for (const key of required) {
  if (!process.env[key]) {
    logger.error('system', 'config_missing', { key, hint: `set ${key} in .env` })
    process.exit(1)
  }
}

// Export config object
export default {
  // Provider config
  provider: process.env.PROVIDER || 'claude-cli',
  model: process.env.MODEL || 'sonnet',
  identityFile: process.env.IDENTITY_FILE || 'identities/kenobot.md',

  // Telegram config
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    allowedChatIds: process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(id => id.trim()) || []
  },

  // Data directories
  dataDir: process.env.DATA_DIR || './data',

  // Memory
  memoryDays: parseInt(process.env.MEMORY_DAYS || '3', 10)
}
