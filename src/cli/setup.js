import { mkdir, cp, readdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFile, exec } from 'node:child_process'
import { promisify } from 'node:util'
import { GREEN, RED, YELLOW, NC, exists, requiredDirs } from './utils.js'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

const info = (msg) => console.log(`${GREEN}[✓]${NC} ${msg}`)
const skip = (msg) => console.log(`${YELLOW}[–]${NC} ${msg}`)
const warn = (msg) => console.log(`${YELLOW}[!]${NC} ${msg}`)

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
  // Parse flags
  const flags = {
    installClaude: args.includes('--install-claude'),
    installGemini: args.includes('--install-gemini'),
    installAll: args.includes('--install-all')
  }

  // --install-all expands to all individual flags
  if (flags.installAll) {
    flags.installClaude = true
    flags.installGemini = true
  }

  // Fail early if running as root
  if (process.getuid?.() === 0) {
    console.error(`\n${RED}[✗]${NC} Running as root is not supported.\n`)
    console.error(`  Create a dedicated user and try again:`)
    console.error(`    sudo adduser kenobot`)
    console.error(`    su - kenobot`)
    console.error(`    kenobot setup\n`)
    console.error(`  See: docs/guides/vps-setup.md\n`)
    process.exit(1)
  }

  console.log(`Setting up KenoBot in ${paths.home}\n`)

  // Install requested tools
  const needsPATH = flags.installClaude || flags.installGemini

  if (flags.installClaude) {
    await installClaudeCLI()
  }

  if (flags.installGemini) {
    await installGeminiCLI()
  }

  // Configure PATH once if any tool was installed
  if (needsPATH) {
    await configurePATH()
    console.log('')
  }

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

/**
 * Install Claude Code CLI
 */
async function installClaudeCLI() {
  try {
    await execAsync('command -v claude')
    const version = await execAsync('claude --version 2>&1 | head -1')
    skip(`Claude Code CLI already installed (${version.stdout.trim()})`)
  } catch {
    console.log('Installing Claude Code CLI...')
    try {
      // Unset CLAUDECODE to avoid nested session error
      const env = { ...process.env }
      delete env.CLAUDECODE
      await execAsync('curl -fsSL https://claude.ai/install.sh | bash', { env })
      info('Claude Code CLI installed')
    } catch (error) {
      warn(`Claude Code CLI installation failed: ${error.message}`)
      console.log('  You can install it manually later: https://claude.ai/download')
    }
  }
}

/**
 * Install Gemini CLI
 */
async function installGeminiCLI() {
  try {
    await execAsync('command -v gemini')
    const version = await execAsync('gemini --version 2>&1 | head -1')
    skip(`Gemini CLI already installed (${version.stdout.trim()})`)
  } catch {
    console.log('Installing Gemini CLI...')
    try {
      await execAsync('npm install -g @google/gemini-cli')
      info('Gemini CLI installed')
    } catch (error) {
      warn(`Gemini CLI installation failed: ${error.message}`)
      console.log('  You can install it manually: npm install -g @google/gemini-cli')
    }
  }
}

/**
 * Ensure ~/.local/bin is in PATH by updating shell config files.
 */
async function configurePATH() {
  const localBin = join(homedir(), '.local', 'bin')
  const bashrc = join(homedir(), '.bashrc')
  const zshrc = join(homedir(), '.zshrc')

  // Create ~/.local/bin if it doesn't exist
  await mkdir(localBin, { recursive: true })

  const pathExport = '\n# Add local bin to PATH\nexport PATH="$HOME/.local/bin:$PATH"\n'

  // Update .bashrc if it exists or if we're using bash
  if (await exists(bashrc)) {
    const content = await readFile(bashrc, 'utf8')
    if (!content.includes('.local/bin')) {
      await appendFile(bashrc, pathExport)
      info('Added ~/.local/bin to PATH in ~/.bashrc')
    } else {
      skip('~/.local/bin already in PATH (~/.bashrc)')
    }
  } else if (process.env.SHELL?.includes('bash')) {
    await writeFile(bashrc, pathExport)
    info('Created ~/.bashrc with PATH configuration')
  }

  // Update .zshrc if it exists or if we're using zsh
  if (await exists(zshrc)) {
    const content = await readFile(zshrc, 'utf8')
    if (!content.includes('.local/bin')) {
      await appendFile(zshrc, pathExport)
      info('Added ~/.local/bin to PATH in ~/.zshrc')
    } else {
      skip('~/.local/bin already in PATH (~/.zshrc)')
    }
  } else if (process.env.SHELL?.includes('zsh')) {
    await writeFile(zshrc, pathExport)
    info('Created ~/.zshrc with PATH configuration')
  }
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
