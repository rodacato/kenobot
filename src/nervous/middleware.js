import { MESSAGE_IN, MESSAGE_OUT, THINKING_START } from '../events.js'

/**
 * Built-in middleware for the Nervous System.
 *
 * Middleware signature: (signal) => void | false
 * Return false to inhibit signal delivery (block it).
 *
 * Inspired by: EIP Pipes and Filters, biological myelin sheath.
 */

/**
 * Trace propagation middleware.
 *
 * When MESSAGE_IN fires, stores its traceId keyed by chatId.
 * When MESSAGE_OUT fires for the same chatId, attaches the stored traceId.
 * Enables end-to-end request tracing across the system.
 *
 * Inspired by: EIP Correlation Identifier pattern.
 */
export function createTraceMiddleware() {
  const traces = new Map() // chatId → traceId

  return (signal) => {
    if (signal.type === MESSAGE_IN && signal.payload?.chatId) {
      traces.set(signal.payload.chatId, signal.traceId)
    }

    if (signal.type === MESSAGE_OUT && signal.payload?.chatId) {
      const originTraceId = traces.get(signal.payload.chatId)
      if (originTraceId) {
        signal.traceId = originTraceId
        traces.delete(signal.payload.chatId)
      }
    }
  }
}

/**
 * Logging middleware.
 *
 * Logs every signal through the structured logger.
 * Skips noisy signals (THINKING_START) by default.
 *
 * Inspired by: EIP Wire Tap pattern.
 *
 * @param {Object} logger - Logger instance
 * @param {Object} [options]
 * @param {Set<string>} [options.quiet] - Signal types to skip logging
 */
export function createLoggingMiddleware(logger, { quiet } = {}) {
  const skip = quiet || new Set([THINKING_START])

  return (signal) => {
    if (skip.has(signal.type)) return

    logger.info('nervous', signal.type, {
      source: signal.source,
      traceId: signal.traceId
    })
  }
}

/**
 * Dead signal detection middleware.
 *
 * Warns when a signal fires with zero listeners.
 * Useful for catching unused events (like CONFIG_CHANGED was).
 *
 * Inspired by: EIP Dead Letter Channel.
 *
 * @param {EventEmitter} emitter - The NervousSystem instance
 * @param {Object} logger - Logger instance
 */
export function createDeadSignalMiddleware(emitter, logger) {
  return (signal) => {
    const count = emitter.listenerCount(signal.type)
    if (count === 0) {
      logger.warn('nervous', 'dead_signal', {
        type: signal.type,
        source: signal.source,
        traceId: signal.traceId
      })
    }
  }
}
