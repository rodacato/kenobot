import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BACKUPS = 30

export default async function backup(args, paths) {
  mkdirSync(paths.backups, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `kenobot-${timestamp}.tar.gz`
  const filepath = join(paths.backups, filename)

  console.log(`Backing up config/ and data/ from ${paths.home}`)

  execSync(
    `tar -czf "${filepath}" -C "${paths.home}" config data`,
    { stdio: 'inherit' }
  )

  console.log(`Backup saved: ${filepath}`)

  // Rotate: keep only the last MAX_BACKUPS
  const backups = readdirSync(paths.backups)
    .filter(f => f.startsWith('kenobot-') && f.endsWith('.tar.gz'))
    .sort()

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(0, backups.length - MAX_BACKUPS)
    for (const file of toDelete) {
      unlinkSync(join(paths.backups, file))
      console.log(`Rotated: ${file}`)
    }
  }

  console.log(`Total backups: ${Math.min(backups.length, MAX_BACKUPS)}`)
}
