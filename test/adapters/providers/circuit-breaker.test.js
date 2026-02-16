import { describe, it, expect, beforeEach, vi } from 'vitest'
import CircuitBreakerProvider, { CircuitBreakerOpenError } from '../../../src/adapters/providers/circuit-breaker.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

class FakeProvider {
  constructor() {
    this.chatFn = vi.fn()
  }
  get name() { return 'fake' }
  async chat(messages, options) { return this.chatFn(messages, options) }
}

describe('CircuitBreakerProvider', () => {
  let inner, cb

  beforeEach(() => {
    inner = new FakeProvider()
    cb = new CircuitBreakerProvider(inner, { threshold: 3, cooldown: 1000 })
    vi.clearAllMocks()
  })

  it('should pass through name from inner provider', () => {
    expect(cb.name).toBe('fake')
  })

  it('should delegate chat to inner provider when CLOSED', async () => {
    const expected = { content: 'hello', toolCalls: null }
    inner.chatFn.mockResolvedValue(expected)

    const result = await cb.chat([{ role: 'user', content: 'hi' }])

    expect(result).toBe(expected)
    expect(inner.chatFn).toHaveBeenCalledTimes(1)
  })

  it('should stay CLOSED after successful calls', async () => {
    inner.chatFn.mockResolvedValue({ content: 'ok' })

    await cb.chat([])
    await cb.chat([])

    expect(cb.state).toBe('CLOSED')
    expect(cb.failures).toBe(0)
  })

  it('should count failures but stay CLOSED below threshold', async () => {
    inner.chatFn.mockRejectedValue(new Error('fail'))

    for (let i = 0; i < 2; i++) {
      await expect(cb.chat([])).rejects.toThrow('fail')
    }

    expect(cb.state).toBe('CLOSED')
    expect(cb.failures).toBe(2)
  })

  it('should open after reaching failure threshold', async () => {
    inner.chatFn.mockRejectedValue(new Error('fail'))

    for (let i = 0; i < 3; i++) {
      await expect(cb.chat([])).rejects.toThrow('fail')
    }

    expect(cb.state).toBe('OPEN')
    expect(cb.failures).toBe(3)
  })

  it('should reject immediately when OPEN', async () => {
    inner.chatFn.mockRejectedValue(new Error('fail'))

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.chat([])).rejects.toThrow('fail')
    }

    // Now should reject without calling inner
    inner.chatFn.mockClear()
    await expect(cb.chat([])).rejects.toThrow(CircuitBreakerOpenError)
    expect(inner.chatFn).not.toHaveBeenCalled()
  })

  it('should transition to HALF_OPEN after cooldown', async () => {
    inner.chatFn.mockRejectedValue(new Error('fail'))

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.chat([])).rejects.toThrow('fail')
    }
    expect(cb.state).toBe('OPEN')

    // Simulate cooldown elapsed
    cb.lastFailure = Date.now() - 1001

    // Should try one call (HALF_OPEN)
    inner.chatFn.mockResolvedValue({ content: 'recovered' })
    const result = await cb.chat([])

    expect(result.content).toBe('recovered')
    expect(cb.state).toBe('CLOSED')
    expect(cb.failures).toBe(0)
  })

  it('should re-open if HALF_OPEN call fails', async () => {
    inner.chatFn.mockRejectedValue(new Error('fail'))

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.chat([])).rejects.toThrow('fail')
    }

    // Simulate cooldown elapsed
    cb.lastFailure = Date.now() - 1001

    // Half-open call fails
    await expect(cb.chat([])).rejects.toThrow('fail')
    expect(cb.state).toBe('OPEN')
  })

  it('should reset failure count on success', async () => {
    inner.chatFn
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ content: 'ok' })

    await expect(cb.chat([])).rejects.toThrow()
    await expect(cb.chat([])).rejects.toThrow()
    expect(cb.failures).toBe(2)

    await cb.chat([])
    expect(cb.failures).toBe(0)
    expect(cb.state).toBe('CLOSED')
  })

  it('should re-throw the original error from inner provider', async () => {
    const originalError = new Error('specific error')
    originalError.status = 500
    inner.chatFn.mockRejectedValue(originalError)

    await expect(cb.chat([])).rejects.toBe(originalError)
  })

  describe('getStatus', () => {
    it('should return current state', () => {
      const status = cb.getStatus()

      expect(status.state).toBe('CLOSED')
      expect(status.failures).toBe(0)
      expect(status.threshold).toBe(3)
      expect(status.cooldownMs).toBe(1000)
      expect(status.provider).toBe('fake')
      expect(status.lastSuccess).toBeGreaterThan(0)
      expect(status.lastFailure).toBeNull()
    })

    it('should reflect failures after errors', async () => {
      inner.chatFn.mockRejectedValue(new Error('fail'))
      await expect(cb.chat([])).rejects.toThrow()

      const status = cb.getStatus()
      expect(status.failures).toBe(1)
      expect(status.lastFailure).toBeGreaterThan(0)
    })
  })

  describe('CircuitBreakerOpenError', () => {
    it('should include retry time info', () => {
      const err = new CircuitBreakerOpenError('test-provider', 5000)

      expect(err.name).toBe('CircuitBreakerOpenError')
      expect(err.message).toContain('test-provider')
      expect(err.message).toContain('5s')
      expect(err.retryAfterMs).toBe(5000)
    })
  })

  describe('chatWithRetry integration', () => {
    it('should inherit chatWithRetry from BaseProvider', async () => {
      // chatWithRetry calls this.chat() which goes through circuit breaker
      inner.chatFn.mockResolvedValue({ content: 'ok', toolCalls: null })

      const result = await cb.chatWithRetry([{ role: 'user', content: 'hi' }])

      expect(result.content).toBe('ok')
      expect(inner.chatFn).toHaveBeenCalledTimes(1)
    })
  })
})
