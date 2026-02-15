import defaultLogger from './logger.js'
import { HEALTH_RECOVERED, HEALTH_DEGRADED, HEALTH_UNHEALTHY } from './events.js'

/**
 * Watchdog - Internal health monitor that emits bus events
 *
 * Runs periodic health checks and emits bus events on state changes.
 * Components register their own checks (decoupled). Channels react
 * to health events to alert the owner.
 *
 * States: HEALTHY → DEGRADED → UNHEALTHY → HEALTHY (recovered)
 *
 * Bus events emitted:
 *   health:degraded  — some checks failing, bot still responds
 *   health:unhealthy — critical failure, needs intervention
 *   health:recovered — back to healthy from degraded/unhealthy
 */
export default class Watchdog {
  constructor(bus, { logger = defaultLogger, ...options } = {}) {
    this.bus = bus
    this.logger = logger
    this.interval = options.interval || 60000
    this.state = 'HEALTHY'
    this.checks = new Map()
    this._timer = null
  }

  /**
   * Register a health check.
   * @param {string} name - Check identifier (e.g., 'provider', 'memory', 'disk')
   * @param {Function} fn - Async function returning { status: 'ok'|'warn'|'fail', detail: string }
   * @param {Object} [options] - { critical: boolean } — critical checks trigger UNHEALTHY
   */
  registerCheck(name, fn, options = {}) {
    this.checks.set(name, {
      fn,
      critical: options.critical || false,
      status: 'unknown',
      detail: '',
      lastCheck: 0
    })
  }

  start() {
    if (this._timer) return
    this._timer = setInterval(() => this._runChecks(), this.interval)
    // Run initial check after a short delay (let components initialize)
    setTimeout(() => this._runChecks(), 5000)
    this.logger.info('watchdog', 'started', { interval: this.interval, checks: this.checks.size })
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  async _runChecks() {
    const results = new Map()
    const entries = [...this.checks.entries()]

    // Run all checks in parallel for faster completion
    const checkResults = await Promise.all(
      entries.map(async ([name, check]) => {
        try {
          const result = await check.fn()
          return { name, check, status: result.status || 'ok', detail: result.detail || '' }
        } catch (error) {
          return { name, check, status: 'fail', detail: error.message }
        }
      })
    )

    for (const { name, check, status, detail } of checkResults) {
      check.status = status
      check.detail = detail
      check.lastCheck = Date.now()
      results.set(name, { status, detail, critical: check.critical })
    }

    const newState = this._evaluateState(results)

    if (newState !== this.state) {
      const previous = this.state
      this.state = newState

      const detail = this._summarize(results)

      if (newState === 'HEALTHY' && (previous === 'DEGRADED' || previous === 'UNHEALTHY')) {
        this.logger.info('watchdog', 'recovered', { previous })
        this.bus.fire(HEALTH_RECOVERED, { previous, detail }, { source: 'watchdog' })
      } else if (newState === 'DEGRADED') {
        this.logger.warn('watchdog', 'degraded', { previous, detail })
        this.bus.fire(HEALTH_DEGRADED, { previous, detail }, { source: 'watchdog' })
      } else if (newState === 'UNHEALTHY') {
        this.logger.error('watchdog', 'unhealthy', { previous, detail })
        this.bus.fire(HEALTH_UNHEALTHY, { previous, detail }, { source: 'watchdog' })
      }
    }
  }

  _evaluateState(results) {
    let hasCriticalFail = false
    let hasWarn = false
    let hasFail = false

    for (const [, result] of results) {
      if (result.status === 'fail' && result.critical) hasCriticalFail = true
      if (result.status === 'fail') hasFail = true
      if (result.status === 'warn') hasWarn = true
    }

    if (hasCriticalFail) return 'UNHEALTHY'
    if (hasFail || hasWarn) return 'DEGRADED'
    return 'HEALTHY'
  }

  _summarize(results) {
    const issues = []
    for (const [name, result] of results) {
      if (result.status !== 'ok') {
        issues.push(`${name}: ${result.status} — ${result.detail}`)
      }
    }
    return issues.join('; ') || 'all checks passing'
  }

  /**
   * Get current status for diagnostics tool.
   */
  getStatus() {
    const checks = {}
    for (const [name, check] of this.checks) {
      checks[name] = {
        status: check.status,
        detail: check.detail,
        critical: check.critical,
        lastCheck: check.lastCheck || null
      }
    }

    return {
      state: this.state,
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.floor(process.memoryUsage().rss / 1024 / 1024),
        heap: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      checks
    }
  }
}
