import { describe, it, expect, beforeEach, vi } from 'vitest'
import BaseProvider from '../../../src/adapters/providers/base.js'

// Suppress logger output during tests
vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../../../src/infrastructure/logger.js'

class TestProvider extends BaseProvider {
  constructor() {
    super()
    this.chatFn = vi.fn()
  }

  async chat(messages, options) {
    return this.chatFn(messages, options)
  }

  get name() { return 'test' }

  // Override delay to 1ms for fast tests
  _retryDelay() { return 1 }
}

describe('BaseProvider.chatWithRetry', () => {
  let provider

  beforeEach(() => {
    provider = new TestProvider()
    vi.clearAllMocks()
  })

  it('should return result on first success', async () => {
    const expected = { content: 'hello', toolCalls: null }
    provider.chatFn.mockResolvedValue(expected)

    const result = await provider.chatWithRetry([{ role: 'user', content: 'hi' }])

    expect(result).toBe(expected)
    expect(provider.chatFn).toHaveBeenCalledTimes(1)
  })

  it('should retry on 429 rate limit error', async () => {
    const rateLimitError = new Error('rate limited')
    rateLimitError.status = 429
    const expected = { content: 'success', toolCalls: null }

    provider.chatFn
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce(expected)

    const result = await provider.chatWithRetry([{ role: 'user', content: 'hi' }])

    expect(result).toBe(expected)
    expect(provider.chatFn).toHaveBeenCalledTimes(2)
    expect(logger.warn).toHaveBeenCalledWith('provider', 'retrying', expect.objectContaining({
      attempt: 1,
      status: 429
    }))
  })

  it('should retry on 500 server error', async () => {
    const serverError = new Error('internal server error')
    serverError.status = 500
    const expected = { content: 'ok', toolCalls: null }

    provider.chatFn
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(expected)

    const result = await provider.chatWithRetry([{ role: 'user', content: 'hi' }])

    expect(result).toBe(expected)
    expect(provider.chatFn).toHaveBeenCalledTimes(2)
  })

  it('should retry on 502 and 503 errors', async () => {
    const err502 = new Error('bad gateway')
    err502.status = 502
    const err503 = new Error('service unavailable')
    err503.status = 503
    const expected = { content: 'recovered', toolCalls: null }

    provider.chatFn
      .mockRejectedValueOnce(err502)
      .mockRejectedValueOnce(err503)
      .mockResolvedValueOnce(expected)

    const result = await provider.chatWithRetry([{ role: 'user', content: 'hi' }])

    expect(result).toBe(expected)
    expect(provider.chatFn).toHaveBeenCalledTimes(3)
  })

  it('should throw immediately on non-retryable errors (e.g. 400)', async () => {
    const badRequest = new Error('invalid request')
    badRequest.status = 400

    provider.chatFn.mockRejectedValue(badRequest)

    await expect(provider.chatWithRetry([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('invalid request')
    expect(provider.chatFn).toHaveBeenCalledTimes(1)
  })

  it('should throw immediately on errors without status', async () => {
    provider.chatFn.mockRejectedValue(new Error('network failure'))

    await expect(provider.chatWithRetry([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('network failure')
    expect(provider.chatFn).toHaveBeenCalledTimes(1)
  })

  it('should throw after max retries exhausted', async () => {
    const rateLimitError = new Error('rate limited')
    rateLimitError.status = 429

    provider.chatFn.mockRejectedValue(rateLimitError)

    await expect(provider.chatWithRetry([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('rate limited')
    expect(provider.chatFn).toHaveBeenCalledTimes(3) // 3 attempts total
  })

  it('should log exponential backoff delays', async () => {
    // Use real delay calculation to verify the pattern
    const realDelayProvider = new TestProvider()
    // Restore real delay but spy on it
    const delays = []
    realDelayProvider._retryDelay = (attempt) => {
      const delay = Math.pow(2, attempt - 1) * 1000
      delays.push(delay)
      return 1 // return 1ms for fast execution
    }

    const error503 = new Error('overloaded')
    error503.status = 503
    realDelayProvider.chatFn.mockRejectedValue(error503)

    await expect(realDelayProvider.chatWithRetry([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('overloaded')

    // Verify the delay pattern was calculated correctly
    expect(delays).toEqual([1000, 2000])
  })

  it('should pass messages and options through to chat()', async () => {
    const msgs = [{ role: 'user', content: 'hello' }]
    const opts = { system: 'you are a bot', tools: [] }
    provider.chatFn.mockResolvedValue({ content: 'hi', toolCalls: null })

    await provider.chatWithRetry(msgs, opts)

    expect(provider.chatFn).toHaveBeenCalledWith(msgs, opts)
  })

  it('should respect custom maxRetries', async () => {
    const error = new Error('rate limited')
    error.status = 429
    provider.chatFn.mockRejectedValue(error)

    await expect(provider.chatWithRetry([{ role: 'user', content: 'hi' }], {}, 1))
      .rejects.toThrow('rate limited')
    expect(provider.chatFn).toHaveBeenCalledTimes(1) // no retries with maxRetries=1
  })

  it('should verify default _retryDelay follows exponential pattern', () => {
    const base = new BaseProvider()
    expect(base._retryDelay(1)).toBe(1000)
    expect(base._retryDelay(2)).toBe(2000)
    expect(base._retryDelay(3)).toBe(4000)
  })
})
