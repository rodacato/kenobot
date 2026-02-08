import { readFile, appendFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import logger from '../logger.js'

/**
 * MemoryManager - Daily logs + long-term MEMORY.md
 *
 * Manages two tiers of memory:
 * - Global: MEMORY.md + YYYY-MM-DD.md in data/memory/
 * - Per-chat: MEMORY.md + YYYY-MM-DD.md in data/memory/chats/{sessionId}/
 *
 * Data structure:
 *   data/memory/MEMORY.md
 *   data/memory/2026-02-07.md
 *   data/memory/chats/telegram-63059997/2026-02-07.md
 */
export default class MemoryManager {
  constructor(dataDir) {
    this.memoryDir = join(dataDir, 'memory')
    this._dirReady = false
  }

  // --- Global memory (existing behavior) ---

  /**
   * Append a timestamped entry to today's global daily log.
   * @param {string} entry - e.g. "User preference: prefers Spanish"
   */
  async appendDaily(entry) {
    await this._ensureDir()
    await this._appendDailyToDir(this.memoryDir, entry)
  }

  /**
   * Get content of recent global daily logs, most recent first.
   * @param {number} days - How many days back to look
   * @returns {Promise<string>} Concatenated daily log content
   */
  async getRecentDays(days = 3) {
    await this._ensureDir()
    return this._getRecentDaysFromDir(this.memoryDir, days)
  }

  /**
   * Get global long-term memory content from MEMORY.md.
   * @returns {Promise<string>} MEMORY.md content, or empty string
   */
  async getLongTermMemory() {
    return this._getLongTermFromDir(this.memoryDir)
  }

  // --- Per-chat memory ---

  /**
   * Append a timestamped entry to a chat-specific daily log.
   * Auto-creates the chat directory on first write.
   * @param {string} sessionId - e.g. "telegram-63059997"
   * @param {string} entry - fact to remember for this chat
   */
  async appendChatDaily(sessionId, entry) {
    const chatDir = join(this.memoryDir, 'chats', sessionId)
    await mkdir(chatDir, { recursive: true })
    await this._appendDailyToDir(chatDir, entry, sessionId)
  }

  /**
   * Get recent daily logs for a specific chat.
   * Returns empty string if chat directory doesn't exist (zero-config).
   * @param {string} sessionId
   * @param {number} days
   * @returns {Promise<string>}
   */
  async getChatRecentDays(sessionId, days = 3) {
    return this._getRecentDaysFromDir(join(this.memoryDir, 'chats', sessionId), days)
  }

  /**
   * Get chat-specific long-term memory from MEMORY.md.
   * Returns empty string if not found (zero-config).
   * @param {string} sessionId
   * @returns {Promise<string>}
   */
  async getChatLongTermMemory(sessionId) {
    return this._getLongTermFromDir(join(this.memoryDir, 'chats', sessionId))
  }

  // --- Private helpers ---

  async _appendDailyToDir(dir, entry, scope = 'global') {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toISOString().slice(11, 16)
    const filepath = join(dir, `${date}.md`)

    const line = `## ${time} — ${entry}\n\n`
    await appendFile(filepath, line, 'utf8')

    logger.info('memory', 'daily_append', { date, scope, entry: entry.slice(0, 80) })
  }

  async _getRecentDaysFromDir(dir, days = 3) {
    let files
    try {
      files = await readdir(dir)
    } catch {
      return ''
    }

    // Filter for daily log files (YYYY-MM-DD.md), exclude MEMORY.md
    const dailyFiles = files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, days)

    const sections = []
    for (const file of dailyFiles) {
      try {
        const content = await readFile(join(dir, file), 'utf8')
        const date = file.replace('.md', '')
        sections.push(`### ${date}\n${content.trim()}`)
      } catch {
        // Skip unreadable files
      }
    }

    return sections.join('\n\n')
  }

  async _getLongTermFromDir(dir) {
    try {
      const content = await readFile(join(dir, 'MEMORY.md'), 'utf8')
      if (content.length > 10240) {
        logger.warn('memory', 'memory_file_large', {
          file: 'MEMORY.md',
          dir,
          sizeBytes: content.length,
          hint: 'Consider curating MEMORY.md to keep it under 10KB for optimal context usage'
        })
      }
      return content
    } catch {
      return ''
    }
  }

  async _ensureDir() {
    if (this._dirReady) return
    await mkdir(this.memoryDir, { recursive: true })
    this._dirReady = true
  }
}
