import { config as loadEnv } from 'dotenv'
import { parseArgs } from 'node:util'
import logger from './logger.js'

/**
 * Parse and validate an integer from an env object.
 * Returns errors array instead of calling process.exit().
 */
function envInt(env, key, fallback, { min, max } = {}) {
  const raw = env[key]
  if (!raw) return { value: fallback, errors: [] }
  const val = parseInt(raw, 10)
  const errors = []
  if (Number.isNaN(val)) {
    errors.push({ type: 'config_invalid', key, value: raw, hint: 'must be a number' })
    return { value: fallback, errors }
  }
  if (min !== undefined && val < min) {
    errors.push({ type: 'config_out_of_range', key, value: val, min })
    return { value: fallback, errors }
  }
  if (max !== undefined && val > max) {
    errors.push({ type: 'config_out_of_range', key, value: val, max })
    return { value: fallback, errors }
  }
  return { value: val, errors: [] }
}

/**
 * Create a config object from an environment map.
 * Pure function — no side effects, no process.exit().
 * Tests and multi-instance scenarios can call this directly.
 */
export function createConfig(env = process.env) {
  const errors = []

  const int = (key, fallback, opts) => {
    const { value, errors: errs } = envInt(env, key, fallback, opts)
    errors.push(...errs)
    return value
  }

  const config = {
    provider: env.PROVIDER || 'claude-cli',
    model: env.MODEL || 'sonnet',
    telegram: {
      token: env.TELEGRAM_BOT_TOKEN,
      allowedUsers: env.TELEGRAM_ALLOWED_USERS?.split(',').map(id => id.trim()) || [],
      allowedChatIds: env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(id => id.trim()) || [],
    },

    dataDir: env.DATA_DIR || './data',
    memoryDays: int('MEMORY_DAYS', 3, { min: 0, max: 30 }),
    memoryRetentionDays: int('MEMORY_RETENTION_DAYS', 30, { min: 1, max: 365 }),
    workingMemoryStaleThreshold: int('WORKING_MEMORY_STALE_DAYS', 7, { min: 1, max: 30 }),
    skillsDir: env.SKILLS_DIR || './skills',
    toolsDir: env.TOOLS_DIR || '',
    sessionHistoryLimit: int('SESSION_HISTORY_LIMIT', 20, { min: 1 }),
    maxToolIterations: int('MAX_TOOL_ITERATIONS', 20, { min: 1, max: 100 }),

    n8n: {
      webhookBase: env.N8N_WEBHOOK_BASE || '',
      apiUrl: env.N8N_API_URL || '',
      apiKey: env.N8N_API_KEY || ''
    },

    selfImprovementEnabled: env.SELF_IMPROVEMENT_ENABLED === 'true',
    approvalRequired: env.APPROVAL_REQUIRED !== 'false',
    watchdogInterval: int('WATCHDOG_INTERVAL', 60000, { min: 5000 }),
    fallbackProvider: env.FALLBACK_PROVIDER || '',

    circuitBreaker: {
      threshold: int('CIRCUIT_BREAKER_THRESHOLD', 5, { min: 1 }),
      cooldown: int('CIRCUIT_BREAKER_COOLDOWN', 60000, { min: 1000 })
    },

    http: {
      enabled: env.HTTP_ENABLED === 'true',
      port: int('HTTP_PORT', 3000, { min: 0, max: 65535 }),
      host: env.HTTP_HOST || '127.0.0.1',
      webhookSecret: env.WEBHOOK_SECRET || '',
      timeout: int('HTTP_TIMEOUT', 60000, { min: 1000 })
    }
  }

  return { config, errors }
}

/**
 * Validate config and exit on errors.
 * Called only from index.js — tests never hit this.
 */
export function validateConfig(config, errors = []) {
  for (const err of errors) {
    logger.error('system', err.type, err)
    process.exit(1)
  }

  if (!config.telegram.token) {
    logger.error('system', 'config_missing', { key: 'TELEGRAM_BOT_TOKEN', hint: 'set TELEGRAM_BOT_TOKEN in .env' })
    process.exit(1)
  }

  // Detect placeholder/invalid tokens
  const invalidTokens = ['your_bot_token_here', 'YOUR_BOT_TOKEN', 'placeholder', 'example', 'test_token']
  const isPlaceholder = invalidTokens.some(placeholder =>
    config.telegram.token.toLowerCase().includes(placeholder.toLowerCase())
  )

  if (isPlaceholder) {
    logger.error('system', 'config_invalid', {
      key: 'TELEGRAM_BOT_TOKEN',
      hint: 'TELEGRAM_BOT_TOKEN appears to be a placeholder. Get a real token from @BotFather on Telegram'
    })
    process.exit(1)
  }

  // Validate token format (Telegram tokens are in format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
  const tokenPattern = /^\d{8,10}:[A-Za-z0-9_-]{35}$/
  if (!tokenPattern.test(config.telegram.token)) {
    logger.error('system', 'config_invalid', {
      key: 'TELEGRAM_BOT_TOKEN',
      hint: 'TELEGRAM_BOT_TOKEN format is invalid. Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz'
    })
    process.exit(1)
  }

  if (config.telegram.allowedUsers.length === 0 && config.telegram.allowedChatIds.length === 0) {
    logger.error('system', 'config_missing', {
      key: 'TELEGRAM_ALLOWED_USERS',
      hint: 'set TELEGRAM_ALLOWED_USERS and/or TELEGRAM_ALLOWED_CHAT_IDS in .env'
    })
    process.exit(1)
  }
}

// --- Default singleton (side effects only here) ---

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: process.env.KENOBOT_CONFIG || '.env' }
  },
  strict: false
})

loadEnv({ path: values.config, override: true })

const { config, errors } = createConfig(process.env)
validateConfig(config, errors)

export default config
