import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Structured Logger - JSONL to file + condensed console output
 *
 * Levels: debug, info, warn, error
 * Console: "19:12:30 [info] telegram: message_received userId=123456789"
 * File: {"ts":"...","level":"info","subsystem":"telegram","event":"message_received","data":{}}
 *
 * Console output is filtered by log level (default: info).
 * JSONL file always receives ALL levels for full observability.
 * Works before configure() is called (console-only, file writes buffered).
 */
class Logger {
  constructor() {
    this._logDir = null
    this._ready = false
    this._pending = []
    this._level = LEVELS.info
  }

  configure({ dataDir, logLevel = 'info' }) {
    this._logDir = join(dataDir, 'logs')
    this._level = LEVELS[logLevel] ?? LEVELS.info
    this._ensureDir().then(() => {
      this._ready = true
      for (const entry of this._pending) {
        this._writeToFile(entry)
      }
      this._pending = []
    }).catch(err => {
      process.stderr.write(`Logger init failed: ${err.message}\n`)
    })
  }

  debug(subsystem, event, data = {}) {
    this._log('debug', subsystem, event, data)
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
    const cleanData = {}
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null) cleanData[k] = v
    }

    const entry = {
      ts: new Date().toISOString(),
      level,
      subsystem,
      event,
      ...(Object.keys(cleanData).length > 0 ? { data: cleanData } : {})
    }

    this._writeToConsole(entry)

    if (this._ready) {
      this._writeToFile(entry)
    } else {
      this._pending.push(entry)
    }
  }

  _writeToConsole(entry) {
    if (LEVELS[entry.level] < this._level) return

    const time = entry.ts.slice(11, 19)
    const dataStr = entry.data ? ' ' + this._formatData(entry.data) : ''
    const line = `${time} [${entry.level}] ${entry.subsystem}: ${entry.event}${dataStr}`

    if (entry.level === 'error' || entry.level === 'warn') {
      process.stderr.write(line + '\n')
    } else {
      process.stdout.write(line + '\n')
    }
  }

  _formatData(data) {
    return Object.entries(data)
      .map(([k, v]) => `${k}=${this._formatValue(v)}`)
      .join(' ')
  }

  _formatValue(v) {
    if (typeof v === 'string' && UUID_RE.test(v)) {
      return v.slice(0, 8)
    }
    if (Array.isArray(v)) {
      if (v.length <= 3) return v.join(',')
      return `[${v.slice(0, 2).join(',')}...+${v.length - 2}]`
    }
    if (typeof v === 'string' && v.length > 80) {
      return v.slice(0, 77) + '...'
    }
    return v
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
