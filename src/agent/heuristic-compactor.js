import defaultLogger from '../logger.js'

/**
 * HeuristicCompactor - Dedup-and-merge strategy for daily logs
 *
 * Merges old daily log entries (>retentionDays) into MEMORY.md using
 * case-insensitive substring matching for deduplication.
 *
 * No API calls — zero cost. Memories are already pre-processed by the LLM
 * (extracted from <memory> tags), so no summarization needed.
 *
 * Usage:
 *   const compactor = new HeuristicCompactor()
 *   const stats = await compactor.compact(memory, { retentionDays: 30, logger })
 */
export default class HeuristicCompactor {

  /**
   * Run compaction on a BaseMemory instance.
   * @param {import('./base-memory.js').default} memory - BaseMemory with compaction methods
   * @param {Object} options
   * @param {number} options.retentionDays - Days before a log is considered old (default 30)
   * @param {import('../logger.js').default} [options.logger]
   * @returns {Promise<{ compacted: number, skipped: number, deleted: number }>}
   */
  async compact(memory, { retentionDays = 30, logger = defaultLogger } = {}) {
    // Step 1: List all daily logs
    const allLogs = await memory.listDailyLogs()
    if (allLogs.length === 0) {
      return { compacted: 0, skipped: 0, deleted: 0 }
    }

    // Step 2: Filter to logs older than retention cutoff
    const cutoff = this._getCutoffDate(retentionDays)
    const oldLogs = allLogs.filter(f => this._isOlderThan(f, cutoff))

    if (oldLogs.length === 0) {
      return { compacted: 0, skipped: 0, deleted: 0 }
    }

    logger.info('compactor', 'starting', { oldLogs: oldLogs.length, cutoff })

    // Step 3: Read existing MEMORY.md for deduplication
    const existingMemory = (await memory.getLongTermMemory()) || ''
    const existingLower = existingMemory.toLowerCase()

    // Step 4: Process each old log — extract entries, dedup
    let compacted = 0
    let skipped = 0
    const uniqueEntries = []

    for (const filename of oldLogs) {
      const content = await memory.readDailyLog(filename)
      if (!content) continue

      const entries = this._parseEntries(content)

      for (const entry of entries) {
        const entryLower = entry.toLowerCase()

        // Check against existing MEMORY.md
        if (existingLower.includes(entryLower)) {
          skipped++
          continue
        }

        // Check against entries already collected (intra-batch dedup)
        const isDuplicate = uniqueEntries.some(e => e.toLowerCase() === entryLower)
        if (isDuplicate) {
          skipped++
          continue
        }

        uniqueEntries.push(entry)
        compacted++
      }
    }

    // Step 5: Append unique entries to MEMORY.md
    if (uniqueEntries.length > 0) {
      let updated = existingMemory
      if (updated && !updated.endsWith('\n')) {
        updated += '\n'
      }
      updated += '\n## Compacted memories\n'
      for (const entry of uniqueEntries) {
        updated += `- ${entry}\n`
      }
      await memory.writeLongTermMemory(updated)
    }

    // Step 6: Delete processed log files
    let deleted = 0
    for (const filename of oldLogs) {
      try {
        await memory.deleteDailyLog(filename)
        deleted++
      } catch (error) {
        logger.warn('compactor', 'delete_failed', { filename, error: error.message })
      }
    }

    logger.info('compactor', 'completed', { compacted, skipped, deleted })
    return { compacted, skipped, deleted }
  }

  /**
   * Parse timestamped entries from a daily log file.
   * Format: "## HH:MM -- entry text\n\n"
   * @param {string} content - Raw daily log content
   * @returns {string[]} Extracted entry texts
   */
  _parseEntries(content) {
    const entries = []
    const regex = /^## \d{2}:\d{2} -- (.+)$/gm
    let match
    while ((match = regex.exec(content)) !== null) {
      const entry = match[1].trim()
      if (entry) entries.push(entry)
    }
    return entries
  }

  /**
   * Get the cutoff date string (YYYY-MM-DD) for retention.
   * @param {number} retentionDays
   * @returns {string} ISO date string
   */
  _getCutoffDate(retentionDays) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)
    return cutoff.toISOString().slice(0, 10)
  }

  /**
   * Check if a daily log filename is older than the cutoff date.
   * @param {string} filename - e.g. "2025-12-01.md"
   * @param {string} cutoff - e.g. "2026-01-09"
   * @returns {boolean}
   */
  _isOlderThan(filename, cutoff) {
    const dateStr = filename.replace('.md', '')
    return dateStr < cutoff
  }
}
