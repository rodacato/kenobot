import { randomUUID } from 'node:crypto'

/**
 * Signal - A typed event with metadata envelope.
 *
 * Wraps the raw event payload with tracing and audit information.
 * Listeners still receive the raw payload; the Signal envelope is
 * visible only to middleware and the audit trail.
 *
 * Inspired by: EIP Message pattern, DDD Domain Event, biological action potential.
 */
export default class Signal {
  /**
   * @param {string} type - Signal type (e.g. 'message:in')
   * @param {Object} payload - Raw event data (passed to listeners unchanged)
   * @param {Object} [options]
   * @param {string} [options.source] - Component that fired the signal
   * @param {string} [options.traceId] - Correlation ID (auto-generated if omitted)
   */
  constructor(type, payload, { source, traceId } = {}) {
    this.type = type
    this.payload = payload
    this.source = source || 'unknown'
    this.traceId = traceId || randomUUID()
    this.timestamp = Date.now()
  }

  /**
   * Serialize for JSONL audit trail.
   */
  toJSON() {
    return {
      type: this.type,
      source: this.source,
      traceId: this.traceId,
      timestamp: this.timestamp,
      payload: this.payload
    }
  }
}
