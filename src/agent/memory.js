import { readFile, appendFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import logger from '../logger.js'

/**
 * MemoryManager - Daily logs + long-term MEMORY.md
 *
 * Manages two types of memory:
 * - MEMORY.md: curated long-term facts (human or agent edits)
 * - YYYY-MM-DD.md: daily append-only logs (agent writes via <memory> tags)
 *
 * Data structure:
 *   data/memory/MEMORY.md
 *   data/memory/2026-02-07.md
 *   data/memory/2026-02-06.md
 */
export default class MemoryManager {
  constructor(dataDir) {
    this.memoryDir = join(dataDir, 'memory')
    this._dirReady = false
  }

  /**
   * Append a timestamped entry to today's daily log.
   * @param {string} entry - e.g. "User preference: prefers Spanish"
   */
  async appendDaily(entry) {
    await this._ensureDir()

    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toISOString().slice(11, 16)
    const filepath = join(this.memoryDir, `${date}.md`)

    const line = `## ${time} — ${entry}\n\n`
    await appendFile(filepath, line, 'utf8')

    logger.info('memory', 'daily_append', { date, entry: entry.slice(0, 80) })
  }

  /**
   * Get content of recent daily logs, most recent first.
   * @param {number} days - How many days back to look
   * @returns {Promise<string>} Concatenated daily log content
   */
  async getRecentDays(days = 3) {
    await this._ensureDir()

    let files
    try {
      files = await readdir(this.memoryDir)
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
        const content = await readFile(join(this.memoryDir, file), 'utf8')
        const date = file.replace('.md', '')
        sections.push(`### ${date}\n${content.trim()}`)
      } catch {
        // Skip unreadable files
      }
    }

    return sections.join('\n\n')
  }

  /**
   * Get long-term memory content from MEMORY.md.
   * @returns {Promise<string>} MEMORY.md content, or empty string
   */
  async getLongTermMemory() {
    try {
      return await readFile(join(this.memoryDir, 'MEMORY.md'), 'utf8')
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
