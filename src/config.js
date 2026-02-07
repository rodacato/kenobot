import { config as loadEnv } from 'dotenv'
import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { homedir } from 'node:os'
import logger from './logger.js'

// Parse command line arguments
const { values } = parseArgs({
  options: {
    config: { type: 'string', default: process.env.KENOBOT_CONFIG || '.env' }
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

/**
 * Parse and validate an integer environment variable.
 * Exits on invalid or out-of-range values.
 */
function envInt(key, fallback, { min, max } = {}) {
  const raw = process.env[key]
  if (!raw) return fallback
  const val = parseInt(raw, 10)
  if (Number.isNaN(val)) {
    logger.error('system', 'config_invalid', { key, value: raw, hint: 'must be a number' })
    process.exit(1)
  }
  if (min !== undefined && val < min) {
    logger.error('system', 'config_out_of_range', { key, value: val, min })
    process.exit(1)
  }
  if (max !== undefined && val > max) {
    logger.error('system', 'config_out_of_range', { key, value: val, max })
    process.exit(1)
  }
  return val
}

// Export config object
export default {
  // Provider config
  provider: process.env.PROVIDER || 'claude-cli',
  model: process.env.MODEL || 'sonnet',
  identityFile: process.env.IDENTITY_FILE || 'identities/kenobot',

  // Telegram config
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    allowedChatIds: process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(id => id.trim()) || []
  },

  // Data directories
  dataDir: process.env.DATA_DIR || './data',

  // Memory
  memoryDays: envInt('MEMORY_DAYS', 3, { min: 0, max: 30 }),

  // Skills
  skillsDir: process.env.SKILLS_DIR || './skills',

  // Session
  sessionHistoryLimit: envInt('SESSION_HISTORY_LIMIT', 20, { min: 1 }),

  // Tools
  maxToolIterations: envInt('MAX_TOOL_ITERATIONS', 20, { min: 1, max: 100 }),

  // n8n
  n8n: {
    webhookBase: process.env.N8N_WEBHOOK_BASE || '',
    apiUrl: process.env.N8N_API_URL || '',
    apiKey: process.env.N8N_API_KEY || ''
  },

  // Self-improvement
  selfImprovementEnabled: process.env.SELF_IMPROVEMENT_ENABLED === 'true',
  approvalRequired: process.env.APPROVAL_REQUIRED !== 'false',

  // Config backup (git sync)
  configRepo: process.env.CONFIG_REPO || '',

  // Workspace & GitHub
  workspaceDir: process.env.WORKSPACE_DIR || '',

  // Dev mode: parent directory containing project folders (/dev tool)
  projectsDir: process.env.PROJECTS_DIR || '',
  sshKeyPath: process.env.KENOBOT_SSH_KEY || join(homedir(), '.ssh', 'kenobot_ed25519'),
  github: {
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || ''
  },

  // Watchdog
  watchdogInterval: envInt('WATCHDOG_INTERVAL', 60000, { min: 5000 }),
  fallbackProvider: process.env.FALLBACK_PROVIDER || '',

  // Circuit breaker
  circuitBreaker: {
    threshold: envInt('CIRCUIT_BREAKER_THRESHOLD', 5, { min: 1 }),
    cooldown: envInt('CIRCUIT_BREAKER_COOLDOWN', 60000, { min: 1000 })
  },

  // HTTP webhook channel (opt-in)
  http: {
    enabled: process.env.HTTP_ENABLED === 'true',
    port: envInt('HTTP_PORT', 3000, { min: 1, max: 65535 }),
    host: process.env.HTTP_HOST || '127.0.0.1',
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    timeout: envInt('HTTP_TIMEOUT', 60000, { min: 1000 })
  }
}
