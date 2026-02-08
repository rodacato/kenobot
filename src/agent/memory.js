import { readFile, writeFile, appendFile, readdir, mkdir, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'
import BaseMemory from './base-memory.js'
import defaultLogger from '../logger.js'

/**
 * FileMemory - Filesystem-backed daily logs + long-term MEMORY.md
 *
 * Manages three tiers of memory:
 * - Global: MEMORY.md + YYYY-MM-DD.md in data/memory/
 * - Per-chat: MEMORY.md + YYYY-MM-DD.md in data/memory/chats/{sessionId}/
 * - Working: volatile per-session scratchpad in data/memory/working/{sessionId}.md
 *
 * Data structure:
 *   data/memory/MEMORY.md
 *   data/memory/2026-02-07.md
 *   data/memory/chats/telegram-63059997/2026-02-07.md
 *   data/memory/working/telegram-63059997.md
 */
export default class FileMemory extends BaseMemory {
  constructor(dataDir, { logger = defaultLogger } = {}) {
    super()
    this.memoryDir = join(dataDir, 'memory')
    this.logger = logger
    this._dirReady = false
  }

  // --- Global memory ---

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

  // --- Working memory (per-session, volatile) ---

  /**
   * Write (replace) working memory for a session.
   * @param {string} sessionId - e.g. "telegram-63059997"
   * @param {string} content - Full working memory content
   */
  async writeWorkingMemory(sessionId, content) {
    const dir = join(this.memoryDir, 'working')
    await mkdir(dir, { recursive: true })
    const filepath = join(dir, `${sessionId}.md`)
    await writeFile(filepath, content, 'utf8')
    this.logger.info('memory', 'working_memory_written', { sessionId, sizeBytes: content.length })
  }

  /**
   * Get working memory for a session with its last-updated timestamp.
   * @param {string} sessionId
   * @returns {Promise<{ content: string, updatedAt: number }|null>} null if not found
   */
  async getWorkingMemory(sessionId) {
    try {
      const filepath = join(this.memoryDir, 'working', `${sessionId}.md`)
      const content = await readFile(filepath, 'utf8')
      const fileStat = await stat(filepath)
      return { content, updatedAt: fileStat.mtimeMs }
    } catch {
      return null
    }
  }

  // --- Compaction support ---

  /**
   * List all daily log filenames in the global memory directory.
   * @returns {Promise<string[]>} Sorted filenames, e.g. ["2026-01-01.md", "2026-01-02.md"]
   */
  async listDailyLogs() {
    let files
    try {
      files = await readdir(this.memoryDir)
    } catch {
      return []
    }
    return files
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
  }

  /**
   * Read a specific daily log by filename.
   * @param {string} filename - e.g. "2026-01-15.md"
   * @returns {Promise<string>} File content, or empty string if not found
   */
  async readDailyLog(filename) {
    try {
      return await readFile(join(this.memoryDir, filename), 'utf8')
    } catch {
      return ''
    }
  }

  /**
   * Delete a specific daily log file.
   * @param {string} filename - e.g. "2026-01-15.md"
   */
  async deleteDailyLog(filename) {
    await unlink(join(this.memoryDir, filename))
    this.logger.info('memory', 'daily_log_deleted', { filename })
  }

  /**
   * Overwrite the global MEMORY.md with new content.
   * @param {string} content - Full content to write
   */
  async writeLongTermMemory(content) {
    await this._ensureDir()
    await writeFile(join(this.memoryDir, 'MEMORY.md'), content, 'utf8')
    this.logger.info('memory', 'long_term_written', { sizeBytes: content.length })
  }

  // --- Private helpers ---

  async _appendDailyToDir(dir, entry, scope = 'global') {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toISOString().slice(11, 16)
    const filepath = join(dir, `${date}.md`)

    const line = `## ${time} — ${entry}\n\n`
    await appendFile(filepath, line, 'utf8')

    this.logger.info('memory', 'daily_append', { date, scope, entry: entry.slice(0, 80) })
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
        this.logger.warn('memory', 'memory_file_large', {
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
