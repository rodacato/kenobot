import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import BaseStorage from './base.js'
import logger from '../logger.js'

/**
 * FilesystemStorage - JSONL file persistence for sessions
 *
 * Sessions stored as append-only JSONL files:
 *   data/sessions/telegram-123456789.jsonl
 *
 * Each line is one JSON object:
 *   {"role":"user","content":"hello","timestamp":1707235200000}
 */
export default class FilesystemStorage extends BaseStorage {
  constructor(config) {
    super()
    this.dataDir = config.dataDir || './data'
    this.sessionsDir = join(this.dataDir, 'sessions')
    this._dirReady = false
  }

  async loadSession(sessionId, limit = 20) {
    const filepath = join(this.sessionsDir, `${sessionId}.jsonl`)

    let content
    try {
      content = await readFile(filepath, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }

    const lines = content.split('\n').filter(Boolean)
    const messages = []

    for (const line of lines) {
      try {
        messages.push(JSON.parse(line))
      } catch {
        logger.warn('storage', 'corrupt_jsonl_line', { sessionId, line: line.slice(0, 100) })
      }
    }

    return messages.slice(-limit)
  }

  async saveSession(sessionId, messages) {
    await this._ensureDir()

    const filepath = join(this.sessionsDir, `${sessionId}.jsonl`)
    const data = messages.map(msg => JSON.stringify(msg) + '\n').join('')

    await appendFile(filepath, data, 'utf8')
  }

  async readFile(filePath) {
    try {
      return await readFile(filePath, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`)
      }
      throw err
    }
  }

  get name() {
    return 'filesystem'
  }

  async _ensureDir() {
    if (this._dirReady) return
    await mkdir(this.sessionsDir, { recursive: true })
    this._dirReady = true
  }
}
