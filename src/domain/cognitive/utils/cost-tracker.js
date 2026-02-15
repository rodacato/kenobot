import defaultLogger from '../../../infrastructure/logger.js'

/**
 * CostTracker - Tracks LLM API costs and enforces budgets
 *
 * Features:
 * - Track token usage per model
 * - Calculate costs based on pricing
 * - Budget alerts and enforcement
 * - Daily/monthly cost summaries
 *
 * Phase 6: Basic tracking and alerts
 * Future: Cost optimization suggestions, trend analysis
 */
export default class CostTracker {
  constructor({ logger = defaultLogger, dailyBudget = 1.0, monthlyBudget = 30.0 } = {}) {
    this.logger = logger
    this.dailyBudget = dailyBudget // USD
    this.monthlyBudget = monthlyBudget // USD

    // Pricing per 1M tokens (Claude 3.5 Sonnet pricing as of 2024)
    this.pricing = {
      'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-3-opus': { input: 15.0, output: 75.0 }
    }

    // Track usage
    this.usage = {
      daily: { tokens: 0, cost: 0, calls: 0, date: this.getToday() },
      monthly: { tokens: 0, cost: 0, calls: 0, month: this.getMonth() }
    }
  }

  /**
   * Record API call with token usage.
   *
   * @param {Object} call - API call details
   * @param {string} call.model - Model used
   * @param {number} call.inputTokens - Input tokens
   * @param {number} call.outputTokens - Output tokens
   * @param {string} call.context - Context (e.g., "chat", "sleep", "retrieval")
   * @returns {Object} Cost breakdown
   */
  record({ model, inputTokens, outputTokens, context = 'unknown' }) {
    // Normalize model name
    const normalizedModel = this.normalizeModel(model)
    const pricing = this.pricing[normalizedModel]

    if (!pricing) {
      this.logger.warn('cost-tracker', 'unknown_model', { model })
      return { inputCost: 0, outputCost: 0, totalCost: 0 }
    }

    // Calculate costs
    const inputCost = (inputTokens / 1_000_000) * pricing.input
    const outputCost = (outputTokens / 1_000_000) * pricing.output
    const totalCost = inputCost + outputCost

    // Check if new day/month
    this.checkRollover()

    // Update usage
    this.usage.daily.tokens += inputTokens + outputTokens
    this.usage.daily.cost += totalCost
    this.usage.daily.calls += 1

    this.usage.monthly.tokens += inputTokens + outputTokens
    this.usage.monthly.cost += totalCost
    this.usage.monthly.calls += 1

    // Log and check budget
    this.logger.info('cost-tracker', 'recorded', {
      model: normalizedModel,
      context,
      inputTokens,
      outputTokens,
      cost: totalCost.toFixed(4),
      dailyCost: this.usage.daily.cost.toFixed(4),
      monthlyCost: this.usage.monthly.cost.toFixed(4)
    })

    this.checkBudget()

    return { inputCost, outputCost, totalCost }
  }

  /**
   * Normalize model name to match pricing keys.
   *
   * @param {string} model - Model identifier
   * @returns {string} Normalized model name
   */
  normalizeModel(model) {
    const lower = model.toLowerCase()

    if (lower.includes('sonnet')) return 'claude-3-5-sonnet'
    if (lower.includes('haiku')) return 'claude-3-haiku'
    if (lower.includes('opus')) return 'claude-3-opus'

    // Default to Sonnet if unknown
    return 'claude-3-5-sonnet'
  }

  /**
   * Check if budget thresholds are exceeded.
   * Logs warnings at 80% and 100%.
   */
  checkBudget() {
    const dailyPercent = (this.usage.daily.cost / this.dailyBudget) * 100
    const monthlyPercent = (this.usage.monthly.cost / this.monthlyBudget) * 100

    // Daily budget warnings
    if (dailyPercent >= 100) {
      this.logger.error('cost-tracker', 'daily_budget_exceeded', {
        cost: this.usage.daily.cost.toFixed(4),
        budget: this.dailyBudget,
        percent: dailyPercent.toFixed(1)
      })
    } else if (dailyPercent >= 80) {
      this.logger.warn('cost-tracker', 'daily_budget_warning', {
        cost: this.usage.daily.cost.toFixed(4),
        budget: this.dailyBudget,
        percent: dailyPercent.toFixed(1)
      })
    }

    // Monthly budget warnings
    if (monthlyPercent >= 100) {
      this.logger.error('cost-tracker', 'monthly_budget_exceeded', {
        cost: this.usage.monthly.cost.toFixed(4),
        budget: this.monthlyBudget,
        percent: monthlyPercent.toFixed(1)
      })
    } else if (monthlyPercent >= 80) {
      this.logger.warn('cost-tracker', 'monthly_budget_warning', {
        cost: this.usage.monthly.cost.toFixed(4),
        budget: this.monthlyBudget,
        percent: monthlyPercent.toFixed(1)
      })
    }
  }

  /**
   * Check if day/month has rolled over and reset counters.
   */
  checkRollover() {
    const today = this.getToday()
    const currentMonth = this.getMonth()

    // Reset daily if new day
    if (today !== this.usage.daily.date) {
      this.logger.info('cost-tracker', 'daily_rollover', {
        previousDate: this.usage.daily.date,
        cost: this.usage.daily.cost.toFixed(4),
        calls: this.usage.daily.calls
      })

      this.usage.daily = { tokens: 0, cost: 0, calls: 0, date: today }
    }

    // Reset monthly if new month
    if (currentMonth !== this.usage.monthly.month) {
      this.logger.info('cost-tracker', 'monthly_rollover', {
        previousMonth: this.usage.monthly.month,
        cost: this.usage.monthly.cost.toFixed(4),
        calls: this.usage.monthly.calls
      })

      this.usage.monthly = { tokens: 0, cost: 0, calls: 0, month: currentMonth }
    }
  }

  /**
   * Get current usage statistics.
   *
   * @returns {Object} Usage stats
   */
  getStats() {
    this.checkRollover()

    return {
      daily: {
        ...this.usage.daily,
        budget: this.dailyBudget,
        remaining: Math.max(0, this.dailyBudget - this.usage.daily.cost),
        percent: (this.usage.daily.cost / this.dailyBudget) * 100
      },
      monthly: {
        ...this.usage.monthly,
        budget: this.monthlyBudget,
        remaining: Math.max(0, this.monthlyBudget - this.usage.monthly.cost),
        percent: (this.usage.monthly.cost / this.monthlyBudget) * 100
      }
    }
  }

  /**
   * Check if we're within budget.
   *
   * @returns {boolean}
   */
  isWithinBudget() {
    return this.usage.daily.cost < this.dailyBudget && this.usage.monthly.cost < this.monthlyBudget
  }

  /**
   * Get today's date string (YYYY-MM-DD).
   * @private
   */
  getToday() {
    return new Date().toISOString().split('T')[0]
  }

  /**
   * Get current month string (YYYY-MM).
   * @private
   */
  getMonth() {
    return new Date().toISOString().slice(0, 7)
  }
}
