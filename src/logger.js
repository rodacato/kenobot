import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Structured Logger - JSONL to file + condensed console output
 *
 * Levels: info, warn, error
 * Console: "19:12:30 [info] telegram: message_received userId=123456789"
 * File: {"ts":"...","level":"info","subsystem":"telegram","event":"message_received","data":{}}
 *
 * Works before configure() is called (console-only, file writes buffered).
 */
class Logger {
  constructor() {
    this._logDir = null
    this._ready = false
    this._pending = []
  }

  configure({ dataDir }) {
    this._logDir = join(dataDir, 'logs')
    this._ensureDir().then(() => {
      this._ready = true
      for (const entry of this._pending) {
        this._writeToFile(entry)
      }
      this._pending = []
    })
  }

  info(subsystem, event, data = {}) {
    this._log('info', subsystem, event, data)
  }

  warn(subsystem, event, data = {}) {
    this._log('warn', subsystem, event, data)
  }

  error(subsystem, event, data = {}) {
    this._log('error', subsystem, event, data)
  }

  _log(level, subsystem, event, data) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      subsystem,
      event,
      ...(Object.keys(data).length > 0 ? { data } : {})
    }

    this._writeToConsole(entry)

    if (this._ready) {
      this._writeToFile(entry)
    } else {
      this._pending.push(entry)
    }
  }

  _writeToConsole(entry) {
    const time = entry.ts.slice(11, 19)
    const dataStr = entry.data ? ' ' + this._formatData(entry.data) : ''
    const line = `${time} [${entry.level}] ${entry.subsystem}: ${entry.event}${dataStr}`

    if (entry.level === 'error') {
      process.stderr.write(line + '\n')
    } else if (entry.level === 'warn') {
      process.stderr.write(line + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  }

  _formatData(data) {
    return Object.entries(data)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
  }

  async _writeToFile(entry) {
    if (!this._logDir) return

    const date = entry.ts.slice(0, 10)
    const filepath = join(this._logDir, `kenobot-${date}.log`)
    const line = JSON.stringify(entry) + '\n'

    try {
      await appendFile(filepath, line, 'utf8')
    } catch (err) {
      // Last resort — don't call this.error() to avoid recursion
      process.stderr.write(`Logger file write failed: ${err.message}\n`)
    }
  }

  async _ensureDir() {
    if (!this._logDir) return
    try {
      await mkdir(this._logDir, { recursive: true })
    } catch (err) {
      process.stderr.write(`Logger failed to create log directory: ${err.message}\n`)
    }
  }
}

export { Logger }
export default new Logger()
