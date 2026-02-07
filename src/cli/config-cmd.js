import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

export default async function configCmd(args, paths) {
  const subcmd = args[0]

  if (subcmd === 'edit') {
    if (!existsSync(paths.envFile)) {
      console.error('No .env file found. Run `kenobot init` first.')
      process.exit(1)
    }
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi'
    const child = spawn(editor, [paths.envFile], { stdio: 'inherit' })
    await new Promise((resolve, reject) => {
      child.on('close', resolve)
      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          console.error(`Editor "${editor}" not found. Set $EDITOR or install one:`)
          console.error(`  export EDITOR=nano`)
          console.error(`\nOr edit the file directly:`)
          console.error(`  ${paths.envFile}`)
          process.exit(1)
        }
        reject(err)
      })
    })
    return
  }

  // Default: show current config with redacted secrets
  if (!existsSync(paths.envFile)) {
    console.error('No .env file found. Run `kenobot init` first.')
    process.exit(1)
  }

  const content = await readFile(paths.envFile, 'utf8')
  const lines = content.split('\n')

  console.log(`Config: ${paths.envFile}\n`)

  for (const line of lines) {
    // Redact secret values
    if (/^(TELEGRAM_BOT_TOKEN|ANTHROPIC_API_KEY|WEBHOOK_SECRET)\s*=/.test(line)) {
      const [key] = line.split('=')
      console.log(`${key}=********`)
    } else {
      console.log(line)
    }
  }
}
