import EventEmitter from 'node:events'
import Signal from './signal.js'
import AuditTrail from './audit-trail.js'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * NervousSystem - Signal-aware event bus with middleware and audit.
 *
 * The central signaling backbone of KenoBot. Extends EventEmitter
 * so all existing bus.on() listeners work unchanged.
 *
 * New API: fire(type, payload, opts) creates a Signal, runs the
 * middleware pipeline, logs to the audit trail, then delivers to
 * listeners via emit(). Backward compatible — emit() still works
 * directly for code that hasn't migrated yet.
 *
 * Inspired by: biological nervous system (signal routing with
 * awareness), EIP Message Bus + Pipes and Filters.
 *
 * @example
 *   const nervous = new NervousSystem({ logger, dataDir })
 *   nervous.use(createLoggingMiddleware(logger))
 *   nervous.on(MESSAGE_IN, (payload) => { ... })  // unchanged
 *   nervous.fire(MESSAGE_IN, { text, chatId }, { source: 'telegram' })
 */
export default class NervousSystem extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger]
   * @param {string} [options.dataDir] - Base data directory for audit trail
   * @param {boolean} [options.audit] - Enable audit trail (default: true if dataDir provided)
   */
  constructor({ logger = defaultLogger, dataDir, audit } = {}) {
    super()
    this.setMaxListeners(0)
    this.logger = logger
    this._middleware = []
    this._stats = { fired: 0, inhibited: 0, byType: {} }

    // Audit trail (optional — requires dataDir)
    const enableAudit = audit !== undefined ? audit : !!dataDir
    this._auditTrail = enableAudit && dataDir
      ? new AuditTrail(dataDir, { logger })
      : null
  }

  /**
   * Fire a signal through the nervous system.
   *
   * Creates a Signal envelope, runs middleware pipeline, logs to
   * audit trail, then delivers the raw payload to listeners.
   *
   * @param {string} type - Signal type (e.g. MESSAGE_IN)
   * @param {Object} payload - Event data (passed to listeners unchanged)
   * @param {Object} [options]
   * @param {string} [options.source] - Component firing the signal
   * @param {string} [options.traceId] - Correlation ID (auto-generated if omitted)
   * @returns {Signal|false} The signal, or false if inhibited by middleware
   */
  fire(type, payload, { source, traceId } = {}) {
    const signal = new Signal(type, payload, { source, traceId })

    // Run middleware pipeline
    for (const mw of this._middleware) {
      if (mw(signal) === false) {
        this._stats.inhibited++
        return false
      }
    }

    // Audit trail (non-blocking)
    if (this._auditTrail) {
      this._auditTrail.log(signal)
    }

    // Track stats
    this._stats.fired++
    this._stats.byType[type] = (this._stats.byType[type] || 0) + 1

    // Deliver to listeners (raw payload, backward compatible)
    super.emit(type, payload)

    return signal
  }

  /**
   * Register a middleware function.
   *
   * Middleware runs in registration order on every fire() call.
   * Return false from middleware to inhibit (block) signal delivery.
   *
   * @param {Function} fn - (signal) => void | false
   */
  use(fn) {
    this._middleware.push(fn)
  }

  /**
   * Get the audit trail instance (for querying).
   * @returns {AuditTrail|null}
   */
  getAuditTrail() {
    return this._auditTrail
  }

  /**
   * Get signal throughput statistics.
   * @returns {{ fired: number, inhibited: number, byType: Object }}
   */
  getStats() {
    return { ...this._stats, byType: { ...this._stats.byType } }
  }
}

// Named export for testing (mirrors MessageBus pattern)
export { NervousSystem }
