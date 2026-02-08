import BaseMemory from './base-memory.js'
import defaultLogger from '../logger.js'

/**
 * CompactingMemory - Decorator that adds compaction to any BaseMemory
 *
 * Delegates all CRUD methods to the inner memory implementation.
 * Adds compact() which runs a pluggable compaction strategy.
 *
 * Usage:
 *   const memory = new CompactingMemory(fileMemory, compactor, { retentionDays: 30 })
 *   await memory.compact()  // fire-and-forget on startup
 */
export default class CompactingMemory extends BaseMemory {
  constructor(innerMemory, compactor, { retentionDays = 30, logger = defaultLogger } = {}) {
    super()
    this.inner = innerMemory
    this.compactor = compactor
    this.retentionDays = retentionDays
    this.logger = logger
    this._compacting = false
    this._lastCompaction = null
  }

  // --- Global CRUD (delegate) ---

  async appendDaily(entry) {
    return this.inner.appendDaily(entry)
  }

  async getRecentDays(days = 3) {
    return this.inner.getRecentDays(days)
  }

  async getLongTermMemory() {
    return this.inner.getLongTermMemory()
  }

  // --- Per-chat CRUD (delegate) ---

  async appendChatDaily(sessionId, entry) {
    return this.inner.appendChatDaily(sessionId, entry)
  }

  async getChatRecentDays(sessionId, days = 3) {
    return this.inner.getChatRecentDays(sessionId, days)
  }

  async getChatLongTermMemory(sessionId) {
    return this.inner.getChatLongTermMemory(sessionId)
  }

  // --- Compaction support (delegate) ---

  async listDailyLogs() {
    return this.inner.listDailyLogs()
  }

  async readDailyLog(filename) {
    return this.inner.readDailyLog(filename)
  }

  async deleteDailyLog(filename) {
    return this.inner.deleteDailyLog(filename)
  }

  async writeLongTermMemory(content) {
    return this.inner.writeLongTermMemory(content)
  }

  // --- Compaction ---

  /**
   * Run compaction using the configured strategy.
   * Guarded: concurrent calls are no-ops.
   * @returns {Promise<{ compacted: number, skipped: number, deleted: number }|null>}
   */
  async compact() {
    if (this._compacting) {
      this.logger.info('compacting-memory', 'skipped', { reason: 'already_compacting' })
      return null
    }

    this._compacting = true
    try {
      const stats = await this.compactor.compact(this.inner, {
        retentionDays: this.retentionDays,
        logger: this.logger
      })
      this._lastCompaction = new Date()
      this.logger.info('compacting-memory', 'done', stats)
      return stats
    } catch (error) {
      this.logger.error('compacting-memory', 'failed', { error: error.message })
      throw error
    } finally {
      this._compacting = false
    }
  }

  /**
   * Get compaction status for diagnostics.
   */
  getCompactionStatus() {
    return {
      retentionDays: this.retentionDays,
      lastCompaction: this._lastCompaction,
      isCompacting: this._compacting,
      compactor: this.compactor.constructor.name
    }
  }
}
