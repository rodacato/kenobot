import { mkdir, cp, access, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function isDir(path) {
  try { return (await stat(path)).isDirectory() } catch { return false }
}

async function copyIfMissing(src, dest, label) {
  if (!await exists(src)) {
    console.log(`  skip ${label} (not found in source)`)
    return
  }
  if (await exists(dest)) {
    console.log(`  skip ${label} (already exists in target)`)
    return
  }
  await cp(src, dest, { recursive: true })
  console.log(`  copy ${label}`)
}

// Merge contents of srcDir into destDir (skip existing files)
async function mergeDir(srcDir, destDir, label) {
  if (!await isDir(srcDir)) {
    console.log(`  skip ${label} (not found in source)`)
    return
  }
  await mkdir(destDir, { recursive: true })
  const entries = await readdir(srcDir, { withFileTypes: true })
  let copied = 0
  for (const entry of entries) {
    const dest = join(destDir, entry.name)
    if (await exists(dest)) continue
    await cp(join(srcDir, entry.name), dest, { recursive: true })
    copied++
  }
  console.log(`  merge ${label} (${copied} new entries)`)
}

export default async function migrate(args, paths) {
  const source = args[0]
  if (!source) {
    console.error('Usage: kenobot migrate <path-to-old-kenobot-dir>')
    console.error('Example: kenobot migrate ~/kenobot')
    process.exit(1)
  }

  if (!await isDir(source)) {
    console.error(`Error: ${source} is not a directory`)
    process.exit(1)
  }

  // Validate it looks like an old-style kenobot layout
  const hasEnv = await exists(join(source, '.env'))
  const hasIdentities = await isDir(join(source, 'identities'))
  const hasSrc = await isDir(join(source, 'src'))

  if (!hasSrc) {
    console.error(`Error: ${source} doesn't look like a kenobot project (no src/ directory)`)
    process.exit(1)
  }

  console.log(`Migrating from ${source} to ${paths.home}\n`)

  // Create only data directories (config dirs come from source copies)
  const dirs = [
    paths.config,
    paths.data, join(paths.data, 'sessions'),
    join(paths.data, 'memory'), join(paths.data, 'logs'),
    paths.backups,
  ]
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true })
  }

  console.log('Copying user files:\n')

  // Config files
  await copyIfMissing(join(source, '.env'), paths.envFile, '.env → config/.env')

  // Identities
  if (hasIdentities) {
    await copyIfMissing(
      join(source, 'identities'),
      paths.identities,
      'identities/ → config/identities/'
    )
  }

  // Skills
  if (await isDir(join(source, 'skills'))) {
    await copyIfMissing(
      join(source, 'skills'),
      paths.skills,
      'skills/ → config/skills/'
    )
  }

  // Data (merge into existing dirs — they may already have files)
  const dataSource = join(source, 'data')
  if (await isDir(dataSource)) {
    await mergeDir(join(dataSource, 'sessions'), join(paths.data, 'sessions'), 'data/sessions/')
    await mergeDir(join(dataSource, 'memory'), join(paths.data, 'memory'), 'data/memory/')
    await mergeDir(join(dataSource, 'logs'), join(paths.data, 'logs'), 'data/logs/')
    await copyIfMissing(
      join(dataSource, 'scheduler.jsonl'),
      join(paths.data, 'scheduler.jsonl'),
      'data/scheduler.jsonl'
    )
  }

  console.log(`
Migration complete! You can now use 'kenobot start'.
The old directory at ${source} was not modified.`)
}
