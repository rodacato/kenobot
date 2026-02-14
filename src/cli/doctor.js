import { readFile, readdir, writeFile, unlink } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { checkPid } from '../health.js'
import {
  GREEN, RED, YELLOW, BOLD, DIM, NC,
  printOk, printWarn, printFail, printSkip,
  exists, dirSize, formatBytes, requiredDirs,
} from './utils.js'

const execFileAsync = promisify(execFile)

/**
 * Parse a .env file into a key-value object without side effects.
 * Does not modify process.env.
 */
function parseEnvFile(content) {
  const vars = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    vars[key] = val
  }
  return vars
}

// --- Individual checks ---
// Each returns { status: 'ok'|'warn'|'fail'|'skip', label, detail?, fix? }

function checkRoot() {
  if (process.getuid?.() === 0) {
    return {
      status: 'warn',
      label: 'Running as root — not recommended',
      fix: 'Create a dedicated user: sudo adduser kenobot',
      details: ['claude-cli provider does not work as root', 'See: docs/guides/vps-setup.md'],
    }
  }
  return { status: 'ok', label: 'User (non-root)' }
}

async function checkDirs(paths) {
  const missing = []
  for (const dir of requiredDirs(paths)) {
    if (!await exists(dir.path)) missing.push(dir.label)
  }

  if (missing.length > 0) {
    return {
      status: 'fail',
      label: `Directory structure — missing: ${missing.join(', ')}`,
      fix: "Run 'kenobot setup' to create missing directories",
    }
  }

  // Check writable
  const testFile = join(paths.data, '.doctor-write-test')
  try {
    await writeFile(testFile, '')
    await unlink(testFile)
  } catch {
    return {
      status: 'fail',
      label: 'Directory structure — data/ is not writable',
      fix: `Check permissions on ${paths.data}`,
    }
  }

  return { status: 'ok', label: 'Directory structure' }
}

async function checkConfig(paths) {
  if (!await exists(paths.envFile)) {
    return {
      status: 'fail',
      label: 'Config file — .env not found',
      fix: "Run 'kenobot setup' then 'kenobot config edit'",
    }
  }

  const content = await readFile(paths.envFile, 'utf8')
  const env = parseEnvFile(content)
  const issues = []

  // Required vars
  if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === 'your_bot_token_here') {
    issues.push('TELEGRAM_BOT_TOKEN not set')
  }
  const hasAllowedUsers = env.TELEGRAM_ALLOWED_USERS && env.TELEGRAM_ALLOWED_USERS !== '123456789'
  const hasAllowedChats = env.TELEGRAM_ALLOWED_CHAT_IDS && env.TELEGRAM_ALLOWED_CHAT_IDS !== '123456789'
  if (!hasAllowedUsers && !hasAllowedChats) {
    issues.push('TELEGRAM_ALLOWED_USERS or TELEGRAM_ALLOWED_CHAT_IDS not set')
  }

  // Provider-specific
  const provider = env.PROVIDER || 'claude-cli'
  if (provider === 'claude-api' && !env.ANTHROPIC_API_KEY) {
    issues.push('ANTHROPIC_API_KEY required for claude-api provider')
  }

  // HTTP channel
  if (env.HTTP_ENABLED === 'true' && !env.WEBHOOK_SECRET) {
    issues.push('WEBHOOK_SECRET required when HTTP_ENABLED=true')
  }

  if (issues.length > 0) {
    return {
      status: 'fail',
      label: `Config file — ${issues[0]}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`,
      fix: "Run 'kenobot config edit' to set missing values",
      details: issues,
    }
  }

  return { status: 'ok', label: `Config file (${basename(paths.envFile)})` }
}

async function checkProvider(paths) {
  let env = {}
  try {
    const content = await readFile(paths.envFile, 'utf8')
    env = parseEnvFile(content)
  } catch {
    return { status: 'skip', label: 'Provider (no config file)' }
  }

  const provider = env.PROVIDER || 'claude-cli'

  if (provider === 'mock') {
    return { status: 'ok', label: 'Provider: mock' }
  }

  if (provider === 'claude-api') {
    const key = env.ANTHROPIC_API_KEY || ''
    if (!key) {
      return {
        status: 'fail',
        label: 'Provider: claude-api — ANTHROPIC_API_KEY not set',
        fix: "Run 'kenobot config edit' and set ANTHROPIC_API_KEY",
      }
    }
    if (!key.startsWith('sk-ant-')) {
      return {
        status: 'warn',
        label: 'Provider: claude-api — API key format looks unusual',
      }
    }
    return { status: 'ok', label: 'Provider: claude-api' }
  }

  if (provider === 'claude-cli') {
    try {
      await execFileAsync('which', ['claude'])
      return { status: 'ok', label: 'Provider: claude-cli (binary found)' }
    } catch {
      return {
        status: 'fail',
        label: 'Provider: claude-cli — claude binary not found in PATH',
        fix: 'Install Claude CLI: curl -fsSL https://claude.ai/install.sh | bash',
      }
    }
  }

  if (provider === 'gemini-api') {
    const key = env.GOOGLE_API_KEY || ''
    if (!key) {
      return {
        status: 'fail',
        label: 'Provider: gemini-api — GOOGLE_API_KEY not set',
        fix: "Run 'kenobot config edit' and set GOOGLE_API_KEY",
      }
    }
    return { status: 'ok', label: 'Provider: gemini-api' }
  }

  if (provider === 'gemini-cli') {
    try {
      await execFileAsync('which', ['gemini'])
      return { status: 'ok', label: 'Provider: gemini-cli (binary found)' }
    } catch {
      return {
        status: 'fail',
        label: 'Provider: gemini-cli — gemini binary not found in PATH',
        fix: 'Install Gemini CLI: npm install -g @google/gemini-cli',
      }
    }
  }

  return {
    status: 'warn',
    label: `Provider: ${provider} — unknown provider`,
    fix: "Valid providers: claude-api, claude-cli, gemini-api, gemini-cli, mock",
  }
}

async function checkIdentity(paths) {
  const identityDir = join(paths.home, 'memory', 'identity')

  if (!await exists(identityDir)) {
    return {
      status: 'fail',
      label: 'Identity — directory not found: memory/identity/',
      fix: "Run 'kenobot setup' to restore default identity",
    }
  }

  const expectedFiles = ['core.md', 'rules.json']
  const missing = []
  for (const file of expectedFiles) {
    if (!await exists(join(identityDir, file))) missing.push(file)
  }

  if (missing.length > 0) {
    return {
      status: 'warn',
      label: `Identity — missing: ${missing.join(', ')}`,
      fix: "Run 'kenobot setup' to restore default identity files",
      details: missing.map(f => `memory/identity/${f}`),
    }
  }

  const hasBootstrap = await exists(join(identityDir, 'BOOTSTRAP.md'))
  return { status: 'ok', label: `Identity (memory/identity/)${hasBootstrap ? ' [bootstrap pending]' : ''}` }
}

async function checkTemplateIntegrity(paths) {
  const tplDir = paths.templates
  if (!await exists(tplDir)) {
    return {
      status: 'fail',
      label: 'Templates — directory not found (engine corrupt)',
      fix: 'Reinstall kenobot: npm install -g github:rodacato/kenobot',
    }
  }

  const missing = []

  // Check config/.env exists
  if (!await exists(paths.envFile)) {
    missing.push('config/.env')
  }

  // Check identity files match template
  const tplIdentityDir = join(tplDir, 'identity')
  if (await exists(tplIdentityDir)) {
    const tplFiles = await readdir(tplIdentityDir)
    const identityDir = join(paths.home, 'memory', 'identity')
    for (const file of tplFiles) {
      if (!await exists(join(identityDir, file))) {
        missing.push(`memory/identity/${file}`)
      }
    }
  }

  // Check memory template
  const memoryFile = join(paths.data, 'memory', 'MEMORY.md')
  if (!await exists(memoryFile)) {
    missing.push('data/memory/MEMORY.md')
  }

  if (missing.length > 0) {
    return {
      status: 'warn',
      label: `Template integrity — ${missing.length} file${missing.length > 1 ? 's' : ''} missing`,
      fix: "Run 'kenobot setup' to restore missing files",
      details: missing,
    }
  }

  return { status: 'ok', label: 'Template integrity' }
}

async function checkPidFile(paths) {
  if (!await exists(paths.pidFile)) {
    return { status: 'ok', label: 'PID file (no stale process)' }
  }

  try {
    await checkPid(paths.pidFile)
    return { status: 'ok', label: 'PID file (bot is running)' }
  } catch {
    return {
      status: 'warn',
      label: 'PID file — stale (process not running)',
      fix: `Remove with: rm ${paths.pidFile}`,
    }
  }
}

async function checkDiskUsage(paths) {
  const dirs = [
    { path: join(paths.data, 'sessions'), name: 'sessions/' },
    { path: join(paths.data, 'logs'), name: 'logs/' },
    { path: join(paths.data, 'memory'), name: 'memory/' },
    { path: paths.backups, name: 'backups/' },
  ]

  const WARN_THRESHOLD = 500 * 1024 * 1024  // 500MB
  const sizes = []
  let total = 0

  for (const dir of dirs) {
    const bytes = await dirSize(dir.path)
    total += bytes
    sizes.push({ ...dir, bytes })
  }

  const large = sizes.filter(s => s.bytes > WARN_THRESHOLD)

  if (large.length > 0) {
    const biggest = large.sort((a, b) => b.bytes - a.bytes)[0]
    return {
      status: 'warn',
      label: `Disk usage — ${biggest.name} is ${formatBytes(biggest.bytes)} (total: ${formatBytes(total)})`,
      fix: "Run 'kenobot purge' to clear old data",
    }
  }

  return { status: 'ok', label: `Disk usage (${formatBytes(total)} total)` }
}

async function checkSSHKey(paths) {
  let env = {}
  try {
    const content = await readFile(paths.envFile, 'utf8')
    env = parseEnvFile(content)
  } catch {
    // use defaults
  }

  // Only relevant if config-sync or workspace is configured
  if (!env.CONFIG_REPO && !env.WORKSPACE_DIR) {
    return { status: 'skip', label: 'SSH key (not needed, no CONFIG_REPO or WORKSPACE_DIR)' }
  }

  const keyPath = env.KENOBOT_SSH_KEY || join(homedir(), '.ssh', 'kenobot_ed25519')
  if (await exists(keyPath)) {
    return { status: 'ok', label: 'SSH key' }
  }

  return {
    status: 'warn',
    label: `SSH key — not found at ${keyPath}`,
    fix: "Run 'kenobot setup' to generate SSH key",
  }
}

async function checkRecentLogs(paths) {
  const logsDir = join(paths.data, 'logs')
  if (!await exists(logsDir)) {
    return { status: 'skip', label: 'Recent logs (no logs directory)' }
  }

  // Find today's log file
  const today = new Date().toISOString().slice(0, 10)
  const logFile = join(logsDir, `kenobot-${today}.log`)

  if (!await exists(logFile)) {
    // Try yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const yesterdayFile = join(logsDir, `kenobot-${yesterday}.log`)
    if (!await exists(yesterdayFile)) {
      return { status: 'skip', label: 'Recent logs (no recent log files)' }
    }
    return await analyzeLogFile(yesterdayFile, 'yesterday')
  }

  return await analyzeLogFile(logFile, 'today')
}

async function analyzeLogFile(logFile, dateLabel) {
  const content = await readFile(logFile, 'utf8')
  const lines = content.trim().split('\n').filter(Boolean)

  // Take last 200 lines
  const recent = lines.slice(-200)
  let errorCount = 0
  const errorMessages = new Map()

  for (const line of recent) {
    try {
      const entry = JSON.parse(line)
      if (entry.level === 'error') {
        errorCount++
        const msg = entry.event || entry.error || 'unknown error'
        errorMessages.set(msg, (errorMessages.get(msg) || 0) + 1)
      }
    } catch {
      // skip unparseable lines
    }
  }

  if (errorCount === 0) {
    return { status: 'ok', label: `Recent logs (no errors ${dateLabel})` }
  }

  // Top 3 errors
  const topErrors = [...errorMessages.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([msg, count]) => `${msg} (×${count})`)

  return {
    status: errorCount > 10 ? 'warn' : 'ok',
    label: `Recent logs (${errorCount} errors ${dateLabel})`,
    details: topErrors,
  }
}

async function checkN8n(paths) {
  let env = {}
  try {
    const content = await readFile(paths.envFile, 'utf8')
    env = parseEnvFile(content)
  } catch {
    return { status: 'skip', label: 'n8n (no config file)' }
  }

  const apiUrl = env.N8N_API_URL
  const webhookBase = env.N8N_WEBHOOK_BASE

  if (!apiUrl && !webhookBase) {
    return { status: 'skip', label: 'n8n (not configured)' }
  }

  // Try to reach n8n via API URL first, then webhook base
  const url = apiUrl || webhookBase
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    // Any response means n8n is reachable (even 401/404)
    return { status: 'ok', label: `n8n (reachable at ${new URL(url).host})` }
  } catch {
    return {
      status: 'warn',
      label: `n8n — unreachable at ${url}`,
      fix: 'Check that n8n is running. See: docs/guides/n8n.md',
    }
  }
}

// --- Main ---

export default async function doctor(args, paths) {
  console.log(`\n${BOLD}Checking installation health...${NC}\n`)

  const checks = [
    checkRoot(),
    await checkDirs(paths),
    await checkConfig(paths),
    await checkProvider(paths),
    await checkTemplateIntegrity(paths),
    await checkIdentity(paths),
    await checkPidFile(paths),
    await checkDiskUsage(paths),
    await checkSSHKey(paths),
    await checkN8n(paths),
    await checkRecentLogs(paths),
  ]

  // Print results
  const fixes = []
  let warnings = 0
  let failures = 0

  for (const check of checks) {
    switch (check.status) {
      case 'ok': printOk(check.label); break
      case 'warn': printWarn(check.label); warnings++; break
      case 'fail': printFail(check.label); failures++; break
      case 'skip': printSkip(check.label); break
    }
    if (check.details) {
      for (const d of check.details) {
        console.log(`    ${DIM}${d}${NC}`)
      }
    }
    if (check.fix) fixes.push(check)
  }

  // Summary
  console.log()
  if (failures === 0 && warnings === 0) {
    console.log(`${GREEN}All checks passed.${NC}`)
  } else {
    const parts = []
    if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`)
    if (failures > 0) parts.push(`${failures} problem${failures > 1 ? 's' : ''}`)
    console.log(`${failures > 0 ? RED : YELLOW}${parts.join(', ')} found.${NC}`)
  }

  // Actionable fixes
  if (fixes.length > 0) {
    console.log()
    for (const f of fixes) {
      const icon = f.status === 'fail' ? 'Fix' : 'Tip'
      // Only print single-line fixes as actions (multi-line are already in details)
      if (f.fix && !f.fix.includes('\n')) {
        console.log(`  ${icon}: ${f.fix}`)
      }
    }
  }

  console.log()
}
