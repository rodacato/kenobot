import { mkdir, cp, access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const NC = '\x1b[0m'

const info = (msg) => console.log(`${GREEN}[✓]${NC} ${msg}`)
const skip = (msg) => console.log(`${YELLOW}[–]${NC} ${msg}`)

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function copyIfMissing(src, dest, label) {
  if (await exists(dest)) {
    skip(`${label} (already exists)`)
    return
  }
  await cp(src, dest, { recursive: true })
  info(label)
}

export default async function init(args, paths) {
  console.log(`Setting up KenoBot in ${paths.home}\n`)

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

  // Generate SSH keypair for Git operations
  await generateSSHKey()

  console.log(`\nNext steps:`)
  console.log(`  kenobot config edit     # Set your tokens and provider`)
  console.log(`  kenobot start           # Start the bot`)
}

async function generateSSHKey() {
  const sshDir = join(homedir(), '.ssh')
  const keyPath = join(sshDir, 'kenobot_ed25519')

  if (await exists(keyPath)) {
    skip('SSH key ~/.ssh/kenobot_ed25519 (already exists)')
    return
  }

  await mkdir(sshDir, { recursive: true, mode: 0o700 })

  try {
    await execFileAsync('ssh-keygen', [
      '-t', 'ed25519',
      '-C', 'kenobot',
      '-f', keyPath,
      '-N', ''
    ])
    info('SSH key ~/.ssh/kenobot_ed25519')

    const pubKey = await readFile(`${keyPath}.pub`, 'utf8')
    console.log(`\n  Public key (add to GitHub):`)
    console.log(`  ${pubKey.trim()}\n`)
  } catch (error) {
    skip(`SSH key generation failed: ${error.message}`)
  }
}
