import { appendFile, readFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import defaultLogger from '../../infrastructure/logger.js'
import { THINKING_START } from '../../infrastructure/events.js'

/**
 * AuditTrail - JSONL persistence for signals.
 *
 * Appends one JSON line per signal to date-partitioned files:
 *   {dataDir}/nervous/signals/YYYY-MM-DD.jsonl
 *
 * Follows the same append-only JSONL pattern as session storage
 * (src/storage/filesystem.js) and memory store (src/storage/memory-store.js).
 *
 * Inspired by: Event Sourcing (append-only log), EIP Wire Tap pattern.
 */
export default class AuditTrail {
  /**
   * @param {string} dataDir - Base data directory (e.g. ~/.kenobot/data)
   * @param {Object} [options]
   * @param {Object} [options.logger]
   * @param {Set<string>} [options.exclude] - Signal types to skip (default: THINKING_START)
   */
  constructor(dataDir, { logger = defaultLogger, exclude } = {}) {
    this.signalDir = join(dataDir, 'nervous', 'signals')
    this.logger = logger
    this.exclude = exclude || new Set([THINKING_START])
    this._dirReady = false
  }

  /**
   * Log a signal to the audit trail.
   * Non-blocking: fire-and-forget with error logging.
   *
   * @param {Signal} signal
   */
  log(signal) {
    if (this.exclude.has(signal.type)) return

    this._write(signal).catch(error => {
      this.logger.error('audit-trail', 'write_failed', {
        type: signal.type,
        error: error.message
      })
    })
  }

  /**
   * Query signals from the audit trail.
   *
   * @param {Object} [filters]
   * @param {string} [filters.type] - Filter by signal type
   * @param {number} [filters.since] - Only signals after this timestamp
   * @param {string} [filters.traceId] - Filter by correlation ID
   * @param {number} [filters.limit] - Max results (default: 100)
   * @returns {Promise<Object[]>}
   */
  async query({ type, since, traceId, limit = 100 } = {}) {
    const files = await this._listFiles()
    const results = []

    // Read files in reverse chronological order (newest first)
    for (const file of files.reverse()) {
      if (results.length >= limit) break

      const lines = await this._readFile(file)
      for (const line of lines.reverse()) {
        if (results.length >= limit) break

        try {
          const entry = JSON.parse(line)
          if (type && entry.type !== type) continue
          if (since && entry.timestamp < since) continue
          if (traceId && entry.traceId !== traceId) continue
          results.push(entry)
        } catch {
          // Skip malformed lines
        }
      }
    }

    return results
  }

  /** @private */
  async _write(signal) {
    await this._ensureDir()
    const date = new Date(signal.timestamp).toISOString().slice(0, 10)
    const filepath = join(this.signalDir, `${date}.jsonl`)
    const line = JSON.stringify(signal.toJSON()) + '\n'
    await appendFile(filepath, line, 'utf8')
  }

  /** @private */
  async _listFiles() {
    try {
      const files = await readdir(this.signalDir)
      return files
        .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .sort()
    } catch {
      return []
    }
  }

  /** @private */
  async _readFile(filename) {
    try {
      const content = await readFile(join(this.signalDir, filename), 'utf8')
      return content.trim().split('\n').filter(Boolean)
    } catch {
      return []
    }
  }

  /** @private */
  async _ensureDir() {
    if (this._dirReady) return
    await mkdir(this.signalDir, { recursive: true })
    this._dirReady = true
  }
}
