import { parseArgs } from 'node:util'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { existsSync, openSync, mkdirSync } from 'node:fs'

export default async function start(args, paths) {
  const { values } = parseArgs({
    args,
    options: { daemon: { type: 'boolean', short: 'd', default: false } },
    strict: false,
  })

  // Verify init has been run
  if (!existsSync(paths.envFile)) {
    console.error('Error: ~/.kenobot/ not initialized. Run `kenobot init` first.')
    process.exit(1)
  }

  // Set env vars from resolved paths BEFORE importing index.js
  process.env.KENOBOT_CONFIG = paths.envFile
  if (!process.env.DATA_DIR) process.env.DATA_DIR = paths.data
  if (!process.env.SKILLS_DIR) process.env.SKILLS_DIR = paths.skills
  if (!process.env.IDENTITY_FILE) {
    process.env.IDENTITY_FILE = join(paths.identities, 'kenobot.md')
  }
  process.env.KENOBOT_PID_FILE = paths.pidFile

  if (values.daemon) {
    // Ensure log dir exists for daemon output
    const logDir = join(paths.data, 'logs')
    mkdirSync(logDir, { recursive: true })
    const logFile = join(logDir, `kenobot-${new Date().toISOString().slice(0, 10)}.log`)
    const out = openSync(logFile, 'a')

    const child = spawn(process.execPath, [join(paths.engine, 'src', 'cli.js'), 'start'], {
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env, KENOBOT_HOME: paths.home },
    })
    child.unref()
    console.log(`KenoBot started in background (PID ${child.pid})`)
    console.log(`Logs: ${logFile}`)
    process.exit(0)
  }

  // Foreground: set --config for config.js parseArgs
  process.argv = [process.argv[0], process.argv[1], '--config', paths.envFile]
  await import('../index.js')
}
