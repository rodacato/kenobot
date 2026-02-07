import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export default async function audit(args, paths) {
  const script = join(paths.engine, 'bin', 'audit')
  if (!existsSync(script)) {
    console.error('Audit script not found. Is the engine installed correctly?')
    process.exit(1)
  }

  const child = spawn('bash', [script, ...args], {
    stdio: 'inherit',
    cwd: paths.engine,
  })

  await new Promise((resolve) => {
    child.on('close', (code) => {
      process.exit(code || 0)
    })
  })
}
