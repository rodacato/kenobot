import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import SelfMonitor from '../../../../src/domain/cognitive/metacognition/self-monitor.js'

describe('SelfMonitor', () => {
  let monitor

  beforeEach(() => {
    monitor = new SelfMonitor()
    vi.clearAllMocks()
  })

  describe('evaluate', () => {
    it('should return good quality for a normal response', () => {
      const result = monitor.evaluate(
        'Here is a detailed explanation of how the system works and what you can do with it.',
        { userMessage: 'How does the system work?' }
      )

      expect(result.quality).toBe('good')
      expect(result.score).toBeGreaterThanOrEqual(0.7)
      expect(result.signals).toEqual([])
    })

    it('should detect empty response', () => {
      const result = monitor.evaluate('', {})

      expect(result.quality).toBe('poor')
      expect(result.signals).toContain('response_too_short')
    })

    it('should detect null response', () => {
      const result = monitor.evaluate(null, {})

      expect(result.quality).toBe('poor')
      expect(result.signals).toContain('response_too_short')
    })

    it('should detect very short response', () => {
      const result = monitor.evaluate('Ok.', {})

      expect(result.signals).toContain('response_too_short')
    })

    it('should detect response shorter than expected', () => {
      const longQuestion = 'Can you explain in detail how the authentication system works, including the token refresh mechanism, the session management, and the role-based access control?'
      const shortResponse = 'Yes, it uses tokens.'

      const result = monitor.evaluate(shortResponse, { userMessage: longQuestion })

      expect(result.signals).toContain('response_shorter_than_expected')
    })

    it('should not flag proportional response', () => {
      const question = 'What is 2+2?'
      const response = 'The answer is 4.'

      const result = monitor.evaluate(response, { userMessage: question })

      expect(result.signals).not.toContain('response_shorter_than_expected')
    })

    it('should detect excessive hedging', () => {
      const result = monitor.evaluate(
        'I think maybe this could possibly work, but I am not certain about it.',
        {}
      )

      expect(result.signals).toContain('excessive_hedging')
    })

    it('should detect mild hedging', () => {
      const result = monitor.evaluate(
        'I think this is the right approach for solving your problem with the API integration.',
        {}
      )

      expect(result.signals).toContain('mild_hedging')
    })

    it('should detect Spanish hedging', () => {
      const result = monitor.evaluate(
        'Creo que tal vez esto podria funcionar correctamente.',
        {}
      )

      expect(result.signals).toContain('excessive_hedging')
    })

    it('should detect high repetition', () => {
      const userMessage = 'How does the authentication system handle tokens?'
      const response = 'The authentication system handles tokens by processing tokens in the authentication system.'

      const result = monitor.evaluate(response, { userMessage })

      expect(result.signals).toContain('high_repetition')
    })

    it('should detect missing memory context', () => {
      const result = monitor.evaluate(
        'I can help you with that request.',
        { hadMemory: false }
      )

      expect(result.signals).toContain('no_memory_context')
    })

    it('should not flag when memory is available', () => {
      const result = monitor.evaluate(
        'Based on what I know about your preferences, here is my suggestion.',
        { hadMemory: true }
      )

      expect(result.signals).not.toContain('no_memory_context')
    })

    it('should accumulate penalties from multiple signals', () => {
      const result = monitor.evaluate(
        'Maybe.',
        { hadMemory: false }
      )

      expect(result.quality).toBe('poor')
      expect(result.signals.length).toBeGreaterThan(1)
    })

    it('should cap score at 0', () => {
      const result = monitor.evaluate('', { hadMemory: false })

      expect(result.score).toBeGreaterThanOrEqual(0)
    })

    it('should handle missing context gracefully', () => {
      const result = monitor.evaluate('A normal response that is long enough to pass the checks.')

      expect(result.quality).toBe('good')
    })
  })
})
