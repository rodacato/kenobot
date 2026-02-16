import { access, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Single source of truth for the directory structure.
 * Used by setup (create) and doctor (check).
 */
export function requiredDirs(paths) {
  return [
    { path: paths.config, label: 'config/' },
    { path: join(paths.home, 'memory'), label: 'memory/' },
    { path: join(paths.home, 'memory', 'identity'), label: 'memory/identity/' },
    { path: paths.data, label: 'data/' },
    { path: join(paths.data, 'sessions'), label: 'data/sessions/' },
    { path: join(paths.data, 'logs'), label: 'data/logs/' },
    { path: join(paths.data, 'scheduler'), label: 'data/scheduler/' },
    { path: paths.backups, label: 'backups/' },
  ]
}

// Colors
export const GREEN = '\x1b[32m'
export const RED = '\x1b[31m'
export const YELLOW = '\x1b[33m'
export const BOLD = '\x1b[1m'
export const DIM = '\x1b[2m'
export const NC = '\x1b[0m'

// Output helpers
export const printOk = (msg) => console.log(`  ${GREEN}[✓]${NC} ${msg}`)
export const printWarn = (msg) => console.log(`  ${YELLOW}[!]${NC} ${msg}`)
export const printFail = (msg) => console.log(`  ${RED}[✗]${NC} ${msg}`)
export const printSkip = (msg) => console.log(`  ${DIM}[–]${NC} ${msg}`)

export async function exists(path) {
  try { await access(path); return true } catch { return false }
}

export async function dirSize(dir) {
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

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
