import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

export default async function dev(args, paths) {
  const { values } = parseArgs({
    args,
    options: { verbose: { type: 'boolean', short: 'v', default: false } },
    strict: false,
  })

  if (!existsSync(paths.envFile)) {
    console.error('Error: ~/.kenobot/ not initialized. Run `kenobot setup` first.')
    process.exit(1)
  }

  console.log('Starting KenoBot in dev mode (auto-reload + ~/.kenobot/ isolation)\n')

  const child = spawn(process.execPath, ['--watch', join(paths.engine, 'src', 'index.js')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      KENOBOT_CONFIG: paths.envFile,
      DATA_DIR: paths.data,
      KENOBOT_PID_FILE: paths.pidFile,
      ...(values.verbose ? { LOG_LEVEL: 'debug' } : {}),
    },
  })

  child.on('close', (code) => process.exit(code ?? 0))
}
