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
    // Phase 6: Placeholder - would need to enumerate all sessions
    // For now, return healthy status
    return {
      status: 'ok',
      message: 'Working memory check not yet implemented',
      staleCount: 0
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
    // Phase 6: Placeholder - would need to check file sizes
    // For now, return healthy status
    return {
      status: 'ok',
      message: 'Memory size check not yet implemented',
      totalSize: 0
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
