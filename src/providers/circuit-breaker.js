import BaseProvider from './base.js'
import logger from '../logger.js'

/**
 * CircuitBreakerProvider - Decorator that protects against cascading failures
 *
 * Wraps any provider with circuit breaker logic:
 *   CLOSED   → calls pass through normally
 *   OPEN     → calls rejected immediately (after threshold failures)
 *   HALF_OPEN → one test call allowed after cooldown
 *
 * This is a decorator, not a modification to BaseProvider. Wrap in index.js:
 *   provider = new CircuitBreakerProvider(provider, { threshold: 5 })
 */
export default class CircuitBreakerProvider extends BaseProvider {
  constructor(innerProvider, options = {}) {
    super()
    this.inner = innerProvider
    this.threshold = options.threshold || 5
    this.cooldown = options.cooldown || 60000
    this.state = 'CLOSED'
    this.failures = 0
    this.lastFailure = 0
    this.lastSuccess = Date.now()
  }

  get name() {
    return this.inner.name
  }

  adaptToolDefinitions(definitions) {
    return this.inner.adaptToolDefinitions(definitions)
  }

  buildToolResultMessages(rawContent, results) {
    return this.inner.buildToolResultMessages(rawContent, results)
  }

  async chat(messages, options) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure >= this.cooldown) {
        this.state = 'HALF_OPEN'
        logger.info('provider', 'circuit_half_open', { provider: this.inner.name })
      } else {
        throw new CircuitBreakerOpenError(this.inner.name, this.cooldown - (Date.now() - this.lastFailure))
      }
    }

    try {
      const result = await this.inner.chat(messages, options)
      this._onSuccess()
      return result
    } catch (error) {
      this._onFailure(error)
      throw error
    }
  }

  _onSuccess() {
    if (this.state === 'HALF_OPEN') {
      logger.info('provider', 'circuit_closed', {
        provider: this.inner.name,
        previousFailures: this.failures
      })
    }
    this.failures = 0
    this.state = 'CLOSED'
    this.lastSuccess = Date.now()
  }

  _onFailure(error) {
    this.failures++
    this.lastFailure = Date.now()

    if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
      this.state = 'OPEN'
      logger.warn('provider', 'circuit_opened', {
        provider: this.inner.name,
        failures: this.failures,
        cooldownMs: this.cooldown,
        lastError: error.message
      })
    }
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      lastSuccess: this.lastSuccess,
      lastFailure: this.lastFailure || null,
      threshold: this.threshold,
      cooldownMs: this.cooldown,
      provider: this.inner.name
    }
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(providerName, retryAfterMs) {
    super(`Circuit breaker OPEN for ${providerName}, retry in ${Math.ceil(retryAfterMs / 1000)}s`)
    this.name = 'CircuitBreakerOpenError'
    this.retryAfterMs = retryAfterMs
  }
}
