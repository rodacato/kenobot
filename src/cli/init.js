import { mkdir, cp, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GREEN, YELLOW, NC, exists, requiredDirs } from './utils.js'

const execFileAsync = promisify(execFile)

const info = (msg) => console.log(`${GREEN}[✓]${NC} ${msg}`)
const skip = (msg) => console.log(`${YELLOW}[–]${NC} ${msg}`)

async function copyIfMissing(src, dest, label) {
  if (await exists(dest)) {
    skip(`${label} (already exists)`)
    return
  }
  await cp(src, dest, { recursive: true })
  info(label)
}

/**
 * Ensure a directory has all files from the template.
 * Copies missing files without overwriting existing ones.
 */
async function syncDir(srcDir, destDir, label) {
  await mkdir(destDir, { recursive: true })
  const tplFiles = await readdir(srcDir)
  let restored = 0

  for (const file of tplFiles) {
    const destFile = join(destDir, file)
    if (!await exists(destFile)) {
      await cp(join(srcDir, file), destFile, { recursive: true })
      restored++
    }
  }

  if (restored > 0) {
    info(`${label} (restored ${restored} file${restored > 1 ? 's' : ''})`)
  } else {
    skip(`${label} (complete)`)
  }
}

export default async function init(args, paths) {
  console.log(`Setting up KenoBot in ${paths.home}\n`)

  // Create directory structure (from shared requiredDirs)
  for (const { path } of requiredDirs(paths)) {
    await mkdir(path, { recursive: true })
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

  // Sync identity template (restores missing files without overwriting)
  await syncDir(
    join(tpl, 'identities', 'kenobot'),
    join(paths.identities, 'kenobot'),
    'config/identities/kenobot/'
  )

  // Sync each skill individually (restores missing files without overwriting)
  const skillsSrc = join(tpl, 'skills')
  if (await exists(skillsSrc)) {
    const skills = await readdir(skillsSrc)
    for (const skill of skills) {
      await syncDir(
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
