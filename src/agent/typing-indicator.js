import { THINKING_START } from '../events.js'

const DEFAULT_INTERVAL_MS = 4000

/**
 * Typing indicator middleware.
 *
 * Emits THINKING_START immediately and then on an interval,
 * ensuring cleanup even if the wrapped function throws.
 *
 * @param {EventEmitter} bus
 * @param {{ chatId: string, channel: string }} payload
 * @param {Function} fn - Async function to wrap
 * @param {number} intervalMs - Interval between emissions (default 4000ms)
 * @returns {Promise<*>} Result of fn()
 */
export async function withTypingIndicator(bus, payload, fn, intervalMs = DEFAULT_INTERVAL_MS) {
  bus.emit(THINKING_START, payload)
  const interval = setInterval(() => bus.emit(THINKING_START, payload), intervalMs)
  try {
    return await fn()
  } finally {
    clearInterval(interval)
  }
}
