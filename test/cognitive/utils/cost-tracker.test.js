import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import CostTracker from '../../../src/cognitive/utils/cost-tracker.js'
import logger from '../../../src/logger.js'

describe('CostTracker', () => {
  let tracker

  beforeEach(() => {
    tracker = new CostTracker({ dailyBudget: 1.0, monthlyBudget: 30.0 })
    vi.clearAllMocks()
  })

  describe('record', () => {
    it('should calculate costs correctly for Sonnet', () => {
      const result = tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 1000,
        outputTokens: 1000,
        context: 'chat'
      })

      // Sonnet: $3/1M input, $15/1M output
      expect(result.inputCost).toBeCloseTo(0.003)
      expect(result.outputCost).toBeCloseTo(0.015)
      expect(result.totalCost).toBeCloseTo(0.018)
    })

    it('should calculate costs correctly for Haiku', () => {
      const result = tracker.record({
        model: 'claude-3-haiku',
        inputTokens: 1000,
        outputTokens: 1000,
        context: 'sleep'
      })

      // Haiku: $0.25/1M input, $1.25/1M output
      expect(result.inputCost).toBeCloseTo(0.00025)
      expect(result.outputCost).toBeCloseTo(0.00125)
      expect(result.totalCost).toBeCloseTo(0.0015)
    })

    it('should update daily usage', () => {
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 1000,
        outputTokens: 1000,
        context: 'chat'
      })

      const stats = tracker.getStats()
      expect(stats.daily.tokens).toBe(2000)
      expect(stats.daily.cost).toBeCloseTo(0.018)
      expect(stats.daily.calls).toBe(1)
    })

    it('should update monthly usage', () => {
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 1000,
        outputTokens: 1000,
        context: 'chat'
      })

      const stats = tracker.getStats()
      expect(stats.monthly.tokens).toBe(2000)
      expect(stats.monthly.cost).toBeCloseTo(0.018)
      expect(stats.monthly.calls).toBe(1)
    })

    it('should accumulate multiple calls', () => {
      tracker.record({ model: 'claude-3-5-sonnet', inputTokens: 1000, outputTokens: 1000, context: 'chat' })
      tracker.record({ model: 'claude-3-haiku', inputTokens: 1000, outputTokens: 1000, context: 'sleep' })

      const stats = tracker.getStats()
      expect(stats.daily.calls).toBe(2)
      expect(stats.daily.tokens).toBe(4000)
    })
  })

  describe('normalizeModel', () => {
    it('should normalize Sonnet variants', () => {
      expect(tracker.normalizeModel('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet')
      expect(tracker.normalizeModel('sonnet')).toBe('claude-3-5-sonnet')
    })

    it('should normalize Haiku variants', () => {
      expect(tracker.normalizeModel('claude-3-haiku-20240307')).toBe('claude-3-haiku')
      expect(tracker.normalizeModel('haiku')).toBe('claude-3-haiku')
    })

    it('should default to Sonnet for unknown models', () => {
      expect(tracker.normalizeModel('unknown-model')).toBe('claude-3-5-sonnet')
    })
  })

  describe('checkBudget', () => {
    it('should warn at 80% daily budget', () => {
      // Daily budget is $1.00, so 80% = $0.80
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 50000, // ~$0.15 input
        outputTokens: 44000, // ~$0.66 output
        context: 'chat'
      })

      expect(logger.warn).toHaveBeenCalledWith('cost-tracker', 'daily_budget_warning', expect.any(Object))
    })

    it('should error at 100% daily budget', () => {
      // Daily budget is $1.00
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 50000, // ~$0.15 input
        outputTokens: 60000, // ~$0.90 output
        context: 'chat'
      })

      expect(logger.error).toHaveBeenCalledWith('cost-tracker', 'daily_budget_exceeded', expect.any(Object))
    })
  })

  describe('getStats', () => {
    it('should return complete statistics', () => {
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 1000,
        outputTokens: 1000,
        context: 'chat'
      })

      const stats = tracker.getStats()

      expect(stats.daily).toHaveProperty('tokens')
      expect(stats.daily).toHaveProperty('cost')
      expect(stats.daily).toHaveProperty('calls')
      expect(stats.daily).toHaveProperty('budget')
      expect(stats.daily).toHaveProperty('remaining')
      expect(stats.daily).toHaveProperty('percent')

      expect(stats.monthly).toHaveProperty('tokens')
      expect(stats.monthly).toHaveProperty('budget')
    })

    it('should calculate remaining budget', () => {
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 10000,
        outputTokens: 10000,
        context: 'chat'
      })

      const stats = tracker.getStats()
      expect(stats.daily.remaining).toBeCloseTo(1.0 - 0.18)
      expect(stats.monthly.remaining).toBeCloseTo(30.0 - 0.18)
    })

    it('should calculate percent of budget used', () => {
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 10000,
        outputTokens: 10000,
        context: 'chat'
      })

      const stats = tracker.getStats()
      expect(stats.daily.percent).toBeCloseTo(18)
      expect(stats.monthly.percent).toBeCloseTo(0.6)
    })
  })

  describe('isWithinBudget', () => {
    it('should return true when within budget', () => {
      tracker.record({
        model: 'claude-3-haiku',
        inputTokens: 1000,
        outputTokens: 1000,
        context: 'chat'
      })

      expect(tracker.isWithinBudget()).toBe(true)
    })

    it('should return false when daily budget exceeded', () => {
      tracker.record({
        model: 'claude-3-5-sonnet',
        inputTokens: 50000,
        outputTokens: 60000,
        context: 'chat'
      })

      expect(tracker.isWithinBudget()).toBe(false)
    })
  })
})
