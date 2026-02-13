import { rm, mkdir, stat, cp } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { checkPid } from '../health.js'
import backup from './backup.js'
import { GREEN, RED, YELLOW, BOLD, NC, exists, dirSize, formatBytes, requiredDirs } from './utils.js'

const ok = (msg) => console.log(`${GREEN}[✓]${NC} ${msg}`)
const warn = (msg) => console.log(`${YELLOW}[!]${NC} ${msg}`)

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

  // Build target list from shared requiredDirs (purge-tagged entries)
  const purgeDirs = requiredDirs(paths)
    .filter(d => d.purge)
    .filter(d => {
      if (d.purge === 'always') return true
      if (d.purge === 'memory') return includeMemory
      if (d.purge === 'all') return includeAll
      return false
    })
    .map(d => ({ path: d.path, label: d.label }))

  // PID file is always purged (it's a file, not in requiredDirs)
  const active = [
    ...purgeDirs,
    { path: paths.pidFile, label: 'data/kenobot.pid' },
  ]

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

  // Recreate purged directories (except backups when --all)
  for (const t of toRemove) {
    if (t.label.endsWith('/') && !(includeAll && t.label === 'backups/')) {
      await mkdir(t.path, { recursive: true })
    }
  }

  // Restore MEMORY.md template if memory was purged
  if (includeMemory) {
    const memoryDir = requiredDirs(paths).find(d => d.purge === 'memory')
    const templateMemory = join(paths.templates, 'memory', 'MEMORY.md')
    const destMemory = join(memoryDir.path, 'MEMORY.md')
    if (await exists(templateMemory)) {
      await cp(templateMemory, destMemory)
      ok('Restored data/memory/MEMORY.md from template')
    }
  }

  console.log(`\n${GREEN}Purge complete.${NC} Freed ${formatBytes(totalBytes)}.`)

  if (includeMemory || includeAll) {
    console.log(`\nRun ${BOLD}kenobot setup${NC} to restore default files.`)
  }
}
