import { config as loadEnv } from 'dotenv'
import { parseArgs } from 'node:util'
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
  memoryDays: parseInt(process.env.MEMORY_DAYS || '3', 10),

  // Skills
  skillsDir: process.env.SKILLS_DIR || './skills',

  // Session
  sessionHistoryLimit: parseInt(process.env.SESSION_HISTORY_LIMIT || '20', 10),

  // Tools
  maxToolIterations: parseInt(process.env.MAX_TOOL_ITERATIONS || '20', 10),

  // n8n
  n8n: {
    webhookBase: process.env.N8N_WEBHOOK_BASE || '',
    apiUrl: process.env.N8N_API_URL || '',
    apiKey: process.env.N8N_API_KEY || ''
  },

  // Self-improvement
  selfImprovementEnabled: process.env.SELF_IMPROVEMENT_ENABLED === 'true',
  approvalRequired: process.env.APPROVAL_REQUIRED !== 'false',

  // Workspace & GitHub
  workspaceDir: process.env.WORKSPACE_DIR || '',
  github: {
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || ''
  },

  // Watchdog
  watchdogInterval: parseInt(process.env.WATCHDOG_INTERVAL || '60000', 10),
  fallbackProvider: process.env.FALLBACK_PROVIDER || '',

  // Circuit breaker
  circuitBreaker: {
    threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    cooldown: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN || '60000', 10)
  },

  // HTTP webhook channel (opt-in)
  http: {
    enabled: process.env.HTTP_ENABLED === 'true',
    port: parseInt(process.env.HTTP_PORT || '3000', 10),
    host: process.env.HTTP_HOST || '127.0.0.1',
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    timeout: parseInt(process.env.HTTP_TIMEOUT || '60000', 10)
  }
}
