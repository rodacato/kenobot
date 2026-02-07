import { rm, readdir, mkdir, stat, access, cp } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { checkPid } from '../health.js'
import backup from './backup.js'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const NC = '\x1b[0m'

const ok = (msg) => console.log(`${GREEN}[✓]${NC} ${msg}`)
const warn = (msg) => console.log(`${YELLOW}[!]${NC} ${msg}`)

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function dirSize(dir) {
  if (!await exists(dir)) return 0
  let total = 0
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      total += await dirSize(full)
    } else {
      const s = await stat(full)
      total += s.size
    }
  }
  return total
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

export default async function purge(args, paths) {
  const flags = new Set(args)
  const includeMemory = flags.has('--memory') || flags.has('--all')
  const includeAll = flags.has('--all')
  const skipBackup = flags.has('--no-backup')
  const skipConfirm = flags.has('--yes') || flags.has('-y')

  // Check bot is not running
  let running = false
  try {
    const pid = await checkPid(paths.pidFile)
    console.error(`${RED}KenoBot is running (PID ${pid}). Stop it first:${NC}`)
    console.error('  kenobot stop')
    running = true
  } catch {
    // Not running — good
  }
  if (running) {
    process.exit(1)
    return
  }

  // Build target list
  const sessionsDir = join(paths.data, 'sessions')
  const logsDir = join(paths.data, 'logs')
  const schedulerDir = join(paths.data, 'scheduler')
  const memoryDir = join(paths.data, 'memory')

  const targets = [
    { path: sessionsDir, label: 'data/sessions/', always: true },
    { path: logsDir, label: 'data/logs/', always: true },
    { path: schedulerDir, label: 'data/scheduler/', always: true },
    { path: paths.pidFile, label: 'data/kenobot.pid', always: true },
    { path: memoryDir, label: 'data/memory/', always: false, needs: 'memory' },
    { path: paths.backups, label: 'backups/', always: false, needs: 'all' },
  ]

  const active = targets.filter(t => {
    if (t.always) return true
    if (t.needs === 'memory') return includeMemory
    if (t.needs === 'all') return includeAll
    return false
  })

  // Calculate sizes and filter to existing paths
  let totalBytes = 0
  const toRemove = []
  for (const t of active) {
    if (!await exists(t.path)) continue
    const s = await stat(t.path)
    const bytes = s.isDirectory() ? await dirSize(t.path) : s.size
    totalBytes += bytes
    toRemove.push({ ...t, bytes })
  }

  if (toRemove.length === 0) {
    console.log('Nothing to purge.')
    return
  }

  // Show what will be removed
  const level = includeAll ? 'full reset' : includeMemory ? 'data + memory' : 'data only'
  console.log(`${BOLD}Purge level:${NC} ${level}`)
  console.log(`${BOLD}Home:${NC} ${paths.home}\n`)

  console.log('Will remove:')
  for (const t of toRemove) {
    console.log(`  ${RED}✕${NC} ${t.label} (${formatBytes(t.bytes)})`)
  }
  console.log(`\nTotal: ${formatBytes(totalBytes)}`)

  // Preserved items
  console.log(`\n${GREEN}Preserved:${NC}`)
  console.log('  config/.env, identities/, skills/')
  if (!includeMemory) console.log('  data/memory/')
  if (!includeAll) console.log('  backups/')

  // Confirm
  if (!skipConfirm) {
    console.log()
    const yes = await confirm(`Proceed with purge? [y/N] `)
    if (!yes) {
      console.log('Aborted.')
      return
    }
  }

  // Backup first
  if (!skipBackup && await exists(paths.data)) {
    console.log()
    warn('Creating backup before purge...')
    try {
      await backup([], paths)
    } catch (err) {
      warn(`Backup failed: ${err.message}`)
      if (!skipConfirm) {
        const cont = await confirm('Continue without backup? [y/N] ')
        if (!cont) {
          console.log('Aborted.')
          return
        }
      }
    }
    console.log()
  }

  // Remove
  for (const t of toRemove) {
    await rm(t.path, { recursive: true, force: true })
    ok(`Removed ${t.label}`)
  }

  // Recreate empty directory structure
  const dirsToRecreate = [sessionsDir, logsDir]
  if (!includeAll) dirsToRecreate.push(join(paths.data, 'scheduler'))
  if (includeMemory) dirsToRecreate.push(memoryDir)

  for (const dir of dirsToRecreate) {
    await mkdir(dir, { recursive: true })
  }

  // Restore MEMORY.md template if memory was purged
  if (includeMemory) {
    const templateMemory = join(paths.templates, 'memory', 'MEMORY.md')
    const destMemory = join(memoryDir, 'MEMORY.md')
    if (await exists(templateMemory)) {
      await cp(templateMemory, destMemory)
      ok('Restored data/memory/MEMORY.md from template')
    }
  }

  console.log(`\n${GREEN}Purge complete.${NC} Freed ${formatBytes(totalBytes)}.`)
}
