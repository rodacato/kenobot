/**
 * ResponseTracker - Ring buffer for message response metrics.
 *
 * Tracks latency, errors, and tool iterations for the last N responses.
 * Provides aggregate stats (avg, max, p95, error rate) for observability.
 *
 * Pure data structure — no dependencies, no side effects.
 */
export default class ResponseTracker {
  constructor({ capacity = 100 } = {}) {
    this._buffer = []
    this._capacity = capacity
    this._totals = { count: 0, errors: 0, totalMs: 0 }
  }

  /**
   * Record a response metric.
   * @param {Object} entry
   * @param {number} entry.durationMs - Response time in milliseconds
   * @param {boolean} [entry.error=false] - Whether the response was an error
   * @param {number} [entry.toolIterations=0] - Number of tool iterations used
   */
  record({ durationMs, error = false, toolIterations = 0 }) {
    this._buffer.push({ durationMs, error, toolIterations, timestamp: Date.now() })
    if (this._buffer.length > this._capacity) this._buffer.shift()

    this._totals.count++
    this._totals.totalMs += durationMs
    if (error) this._totals.errors++
  }

  /**
   * Get aggregate statistics.
   * @returns {Object} Stats snapshot
   */
  getStats() {
    const recent = this._buffer
    const durations = recent.map(r => r.durationMs)

    return {
      total: this._totals.count,
      errors: this._totals.errors,
      recent: recent.length,
      avgMs: recent.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      maxMs: recent.length > 0 ? Math.max(...durations) : 0,
      p95Ms: this._percentile(durations, 0.95),
      errorRate: this._totals.count > 0 ? ((this._totals.errors / this._totals.count) * 100).toFixed(1) : '0.0'
    }
  }

  /**
   * Calculate percentile from an array of values.
   * @private
   */
  _percentile(values, p) {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil(p * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }
}
