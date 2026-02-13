import { readFile, writeFile, appendFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import defaultLogger from '../logger.js'

/**
 * MemoryStore - Persistence layer for cognitive memory system
 *
 * Phase 1: Wrapper around existing FileMemory structure (data/memory/)
 * Phase 3: Will handle new structure (memory/semantic/, memory/episodic/, etc.)
 *
 * This abstraction allows us to migrate storage without changing consumers.
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
   * Phase 1: Reads data/memory/MEMORY.md
   * Phase 3: Will read memory/semantic/facts.md
   */
  async readLongTermMemory() {
    try {
      return await readFile(join(this.memoryDir, 'MEMORY.md'), 'utf8')
    } catch {
      return ''
    }
  }

  /**
   * Append to global daily log.
   * Phase 1: Appends to data/memory/YYYY-MM-DD.md
   * Phase 3: Will append to memory/episodic/shared/YYYY-MM-DD.md
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
   * Phase 1: Reads from data/memory/
   * Phase 3: Will read from memory/episodic/shared/
   */
  async getRecentDays(days = 3) {
    return this._getRecentDaysFromDir(this.memoryDir, days)
  }

  // --- Per-chat memory (episodic) ---

  /**
   * Append to chat-specific daily log.
   * Phase 1: data/memory/chats/{sessionId}/YYYY-MM-DD.md
   * Phase 3: memory/episodic/chats/{sessionId}/YYYY-MM-DD.md
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
   * Get chat-specific long-term memory.
   * Phase 1: data/memory/chats/{sessionId}/MEMORY.md
   * Phase 3: memory/episodic/chats/{sessionId}/facts.md
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
   * Phase 1: data/memory/working/{sessionId}.md
   * Phase 3: memory/working/{sessionId}.json (structured)
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
   * Phase 1: Returns { content, updatedAt }
   * Phase 3: Will return structured JSON
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

  // --- Compaction (for existing system) ---

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
