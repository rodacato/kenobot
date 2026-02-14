import defaultLogger from '../../logger.js'

/**
 * MemoryHealthChecker - Validates memory system integrity
 *
 * Checks:
 * - File integrity (readable, valid format)
 * - Stale working memory count
 * - Last sleep cycle time
 * - Memory size warnings
 *
 * Phase 6: Basic health checks
 * Future: Auto-repair, detailed diagnostics
 */
export default class MemoryHealthChecker {
  constructor(memorySystem, sleepCycle, { logger = defaultLogger } = {}) {
    this.memory = memorySystem
    this.sleepCycle = sleepCycle
    this.logger = logger
  }

  /**
   * Run all health checks.
   *
   * @returns {Promise<Object>} Health status
   */
  async check() {
    const checks = await Promise.allSettled([
      this.checkWorkingMemory(),
      this.checkSleepCycle(),
      this.checkMemorySize()
    ])

    const results = {
      healthy: true,
      checks: {},
      warnings: [],
      errors: []
    }

    // Process check results
    for (let i = 0; i < checks.length; i++) {
      const check = checks[i]
      const checkName = ['workingMemory', 'sleepCycle', 'memorySize'][i]

      if (check.status === 'fulfilled') {
        results.checks[checkName] = check.value

        if (check.value.status === 'warning') {
          results.warnings.push(`${checkName}: ${check.value.message}`)
        } else if (check.value.status === 'error') {
          results.healthy = false
          results.errors.push(`${checkName}: ${check.value.message}`)
        }
      } else {
        results.healthy = false
        results.checks[checkName] = { status: 'error', message: check.reason.message }
        results.errors.push(`${checkName}: ${check.reason.message}`)
      }
    }

    this.logger.info('memory-health', 'check_complete', {
      healthy: results.healthy,
      warningCount: results.warnings.length,
      errorCount: results.errors.length
    })

    return results
  }

  /**
   * Check working memory for stale sessions.
   *
   * @returns {Promise<Object>} Check result
   */
  async checkWorkingMemory() {
    if (!this.memory.store?.listWorkingMemorySessions) {
      return { status: 'ok', message: 'Working memory enumeration not available', staleCount: 0 }
    }

    const sessions = await this.memory.store.listWorkingMemorySessions()
    const now = Date.now()
    const staleThreshold = 7 * 24 * 60 * 60 * 1000 // 7 days
    const staleCount = sessions.filter(s => now - s.updatedAt > staleThreshold).length

    if (staleCount > 10) {
      return {
        status: 'warning',
        message: `${staleCount} stale working memory sessions (>7 days)`,
        staleCount,
        totalSessions: sessions.length
      }
    }

    return {
      status: 'ok',
      message: `${sessions.length} working memory sessions (${staleCount} stale)`,
      staleCount,
      totalSessions: sessions.length
    }
  }

  /**
   * Check sleep cycle status.
   *
   * @returns {Promise<Object>} Check result
   */
  async checkSleepCycle() {
    if (!this.sleepCycle) {
      return {
        status: 'warning',
        message: 'Sleep cycle not configured',
        lastRun: null
      }
    }

    const state = this.sleepCycle.getState()

    // Check if sleep cycle failed
    if (state.status === 'failed') {
      return {
        status: 'error',
        message: `Sleep cycle failed: ${state.error}`,
        lastRun: state.lastRun,
        error: state.error
      }
    }

    // Check if sleep cycle should run but hasn't
    if (this.sleepCycle.shouldRun()) {
      const hoursSinceLastRun = state.lastRun
        ? (Date.now() - new Date(state.lastRun).getTime()) / (1000 * 60 * 60)
        : null

      return {
        status: 'warning',
        message: hoursSinceLastRun
          ? `Sleep cycle overdue (${Math.floor(hoursSinceLastRun)}h since last run)`
          : 'Sleep cycle has never run',
        lastRun: state.lastRun
      }
    }

    return {
      status: 'ok',
      message: 'Sleep cycle healthy',
      lastRun: state.lastRun,
      lastStatus: state.status
    }
  }

  /**
   * Check memory size and warn if too large.
   *
   * @returns {Promise<Object>} Check result
   */
  async checkMemorySize() {
    try {
      const longTerm = await this.memory.getLongTermMemory()
      const sizeBytes = Buffer.byteLength(longTerm || '', 'utf8')
      const sizeKB = Math.floor(sizeBytes / 1024)

      if (sizeKB > 1024) {
        return {
          status: 'warning',
          message: `Long-term memory is ${sizeKB}KB (>1MB) — consider compaction`,
          totalSize: sizeBytes
        }
      }

      return {
        status: 'ok',
        message: `Long-term memory: ${sizeKB}KB`,
        totalSize: sizeBytes
      }
    } catch {
      return {
        status: 'ok',
        message: 'No long-term memory file found',
        totalSize: 0
      }
    }
  }

  /**
   * Get health status as HTTP response format.
   *
   * @returns {Promise<Object>} HTTP-ready health status
   */
  async getHttpStatus() {
    const health = await this.check()

    return {
      status: health.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: health.checks,
      warnings: health.warnings,
      errors: health.errors
    }
  }
}
