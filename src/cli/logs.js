import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export default async function logs(args, paths) {
  const { values } = parseArgs({
    args,
    options: {
      today: { type: 'boolean', default: false },
      date: { type: 'string' },
    },
    strict: false,
  })

  const logDir = join(paths.data, 'logs')
  if (!existsSync(logDir)) {
    console.error('No logs directory found. Has the bot been started?')
    process.exit(1)
  }

  let logFile

  if (values.date) {
    logFile = join(logDir, `kenobot-${values.date}.log`)
  } else if (values.today) {
    const today = new Date().toISOString().slice(0, 10)
    logFile = join(logDir, `kenobot-${today}.log`)
  } else {
    // Find the latest log file
    const files = await readdir(logDir)
    const logFiles = files.filter(f => f.startsWith('kenobot-') && f.endsWith('.log')).sort()
    if (logFiles.length === 0) {
      console.error('No log files found')
      process.exit(1)
    }
    logFile = join(logDir, logFiles[logFiles.length - 1])
  }

  if (!existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`)
    process.exit(1)
  }

  if (values.today || values.date) {
    // Show full file
    const { readFile } = await import('node:fs/promises')
    const content = await readFile(logFile, 'utf8')
    process.stdout.write(content)
  } else {
    // Tail -f the latest log
    console.log(`Tailing ${logFile} (Ctrl+C to stop)\n`)
    const child = spawn('tail', ['-f', logFile], { stdio: 'inherit' })
    process.on('SIGINT', () => { child.kill(); process.exit(0) })
  }
}
