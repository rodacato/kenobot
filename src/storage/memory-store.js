import { readFile, writeFile, appendFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import defaultLogger from '../logger.js'

/**
 * MemoryStore - Persistence layer for the Memory System
 *
 * Filesystem-backed storage for all memory types:
 *   data/memory/MEMORY.md          — global long-term facts
 *   data/memory/YYYY-MM-DD.md      — global daily logs
 *   data/memory/chats/{id}/        — per-chat memory
 *   data/memory/working/{id}.md    — session scratchpad
 *
 * Consumed by MemorySystem (via cognitive sub-classes).
 */
export default class MemoryStore {
  constructor(dataDir, { logger = defaultLogger } = {}) {
    this.dataDir = dataDir
    this.memoryDir = join(dataDir, 'memory')
    this.logger = logger
    this._dirReady = false
  }

  // --- Global memory (semantic) ---

  /**
   * Read global long-term memory (MEMORY.md).
   */
  async readLongTermMemory() {
    try {
      return await readFile(join(this.memoryDir, 'MEMORY.md'), 'utf8')
    } catch {
      return ''
    }
  }

  /**
   * Append to global daily log (data/memory/YYYY-MM-DD.md).
   */
  async appendDaily(entry) {
    await this._ensureDir()
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toISOString().slice(11, 16)
    const filepath = join(this.memoryDir, `${date}.md`)
    const line = `## ${time} — ${entry}\n\n`
    await appendFile(filepath, line, 'utf8')
    this.logger.info('memory-store', 'daily_append', { date, entry: entry.slice(0, 80) })
  }

  /**
   * Get recent daily logs (N days).
   */
  async getRecentDays(days = 3) {
    return this._getRecentDaysFromDir(this.memoryDir, days)
  }

  // --- Per-chat memory (episodic) ---

  /**
   * Append to chat-specific daily log (data/memory/chats/{sessionId}/YYYY-MM-DD.md).
   */
  async appendChatDaily(sessionId, entry) {
    const chatDir = join(this.memoryDir, 'chats', sessionId)
    await mkdir(chatDir, { recursive: true })
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toISOString().slice(11, 16)
    const filepath = join(chatDir, `${date}.md`)
    const line = `## ${time} — ${entry}\n\n`
    await appendFile(filepath, line, 'utf8')
    this.logger.info('memory-store', 'chat_daily_append', { sessionId, date, entry: entry.slice(0, 80) })
  }

  /**
   * Get recent chat-specific daily logs.
   */
  async getChatRecentDays(sessionId, days = 3) {
    const chatDir = join(this.memoryDir, 'chats', sessionId)
    return this._getRecentDaysFromDir(chatDir, days)
  }

  /**
   * Get chat-specific long-term memory (data/memory/chats/{sessionId}/MEMORY.md).
   */
  async getChatLongTermMemory(sessionId) {
    try {
      const filepath = join(this.memoryDir, 'chats', sessionId, 'MEMORY.md')
      return await readFile(filepath, 'utf8')
    } catch {
      return ''
    }
  }

  // --- Working memory ---

  /**
   * Write working memory for a session.
   */
  async writeWorkingMemory(sessionId, content) {
    const dir = join(this.memoryDir, 'working')
    await mkdir(dir, { recursive: true })
    const filepath = join(dir, `${sessionId}.md`)
    await writeFile(filepath, content, 'utf8')
    this.logger.info('memory-store', 'working_memory_written', { sessionId, sizeBytes: content.length })
  }

  /**
   * Get working memory with timestamp.
   * @returns {{ content: string, updatedAt: number }|null}
   */
  async getWorkingMemory(sessionId) {
    try {
      const { stat } = await import('node:fs/promises')
      const filepath = join(this.memoryDir, 'working', `${sessionId}.md`)
      const content = await readFile(filepath, 'utf8')
      const fileStat = await stat(filepath)
      return { content, updatedAt: fileStat.mtimeMs }
    } catch {
      return null
    }
  }

  // --- Compaction ---

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

  async readDailyLog(filename) {
    try {
      return await readFile(join(this.memoryDir, filename), 'utf8')
    } catch {
      return ''
    }
  }

  async writeLongTermMemory(content) {
    await this._ensureDir()
    await writeFile(join(this.memoryDir, 'MEMORY.md'), content, 'utf8')
    this.logger.info('memory-store', 'long_term_written', { sizeBytes: content.length })
  }

  // --- Private helpers ---

  async _getRecentDaysFromDir(dir, days = 3) {
    let files
    try {
      files = await readdir(dir)
    } catch {
      return ''
    }

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

  async _ensureDir() {
    if (this._dirReady) return
    await mkdir(this.memoryDir, { recursive: true })
    this._dirReady = true
  }
}
