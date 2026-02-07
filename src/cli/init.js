import { mkdir, cp, access, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function copyIfMissing(src, dest, label) {
  if (await exists(dest)) {
    console.log(`  skip ${label} (already exists)`)
    return
  }
  await cp(src, dest, { recursive: true })
  console.log(`  create ${label}`)
}

export default async function init(args, paths) {
  console.log(`Initializing KenoBot in ${paths.home}\n`)

  // Create directory structure
  const dirs = [
    paths.config,
    paths.identities,
    paths.skills,
    paths.data,
    join(paths.data, 'sessions'),
    join(paths.data, 'memory'),
    join(paths.data, 'logs'),
    paths.backups,
  ]

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true })
  }

  // Copy templates
  const tpl = paths.templates

  if (!await exists(tpl)) {
    console.error(`Error: templates directory not found at ${tpl}`)
    process.exit(1)
  }

  await copyIfMissing(
    join(tpl, 'env.example'),
    paths.envFile,
    'config/.env'
  )

  await copyIfMissing(
    join(tpl, 'identities', 'kenobot.md'),
    join(paths.identities, 'kenobot.md'),
    'config/identities/kenobot.md'
  )

  // Copy each skill individually (don't overwrite existing ones)
  const skillsSrc = join(tpl, 'skills')
  if (await exists(skillsSrc)) {
    const skills = await readdir(skillsSrc)
    for (const skill of skills) {
      await copyIfMissing(
        join(skillsSrc, skill),
        join(paths.skills, skill),
        `config/skills/${skill}/`
      )
    }
  }

  await copyIfMissing(
    join(tpl, 'memory', 'MEMORY.md'),
    join(paths.data, 'memory', 'MEMORY.md'),
    'data/memory/MEMORY.md'
  )

  console.log(`
Done! Next steps:
  1. Edit your config:  kenobot config edit
  2. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_CHAT_IDS
  3. Start the bot:     kenobot start`)
}
