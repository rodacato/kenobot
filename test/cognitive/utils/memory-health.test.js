import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import MemoryHealthChecker from '../../../src/cognitive/utils/memory-health.js'

describe('MemoryHealthChecker', () => {
  let healthChecker
  let mockMemory
  let mockSleepCycle

  beforeEach(() => {
    mockMemory = {}
    mockSleepCycle = {
      getState: vi.fn().mockReturnValue({
        status: 'success',
        lastRun: new Date().toISOString(),
        currentPhase: null,
        error: null
      }),
      shouldRun: vi.fn().mockReturnValue(false)
    }

    healthChecker = new MemoryHealthChecker(mockMemory, mockSleepCycle)
    vi.clearAllMocks()
  })

  describe('check', () => {
    it('should run all health checks', async () => {
      const result = await healthChecker.check()

      expect(result).toHaveProperty('healthy')
      expect(result).toHaveProperty('checks')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('errors')
    })

    it('should be healthy when all checks pass', async () => {
      const result = await healthChecker.check()

      expect(result.healthy).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should collect warnings', async () => {
      mockSleepCycle.shouldRun.mockReturnValue(true)
      mockSleepCycle.getState.mockReturnValue({
        status: 'success',
        lastRun: null,
        currentPhase: null,
        error: null
      })

      const result = await healthChecker.check()

      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should detect errors', async () => {
      mockSleepCycle.getState.mockReturnValue({
        status: 'failed',
        lastRun: new Date().toISOString(),
        currentPhase: 'consolidation',
        error: 'Test error'
      })

      const result = await healthChecker.check()

      expect(result.healthy).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('checkSleepCycle', () => {
    it('should return ok when sleep cycle is healthy', async () => {
      const result = await healthChecker.checkSleepCycle()

      expect(result.status).toBe('ok')
      expect(result.message).toBe('Sleep cycle healthy')
    })

    it('should return warning when no sleep cycle configured', async () => {
      healthChecker.sleepCycle = null

      const result = await healthChecker.checkSleepCycle()

      expect(result.status).toBe('warning')
      expect(result.message).toContain('not configured')
    })

    it('should return error when sleep cycle failed', async () => {
      mockSleepCycle.getState.mockReturnValue({
        status: 'failed',
        lastRun: new Date().toISOString(),
        error: 'Consolidation error'
      })

      const result = await healthChecker.checkSleepCycle()

      expect(result.status).toBe('error')
      expect(result.message).toContain('failed')
      expect(result.error).toBe('Consolidation error')
    })

    it('should return warning when sleep cycle is overdue', async () => {
      mockSleepCycle.shouldRun.mockReturnValue(true)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      mockSleepCycle.getState.mockReturnValue({
        status: 'success',
        lastRun: yesterday
      })

      const result = await healthChecker.checkSleepCycle()

      expect(result.status).toBe('warning')
      expect(result.message).toContain('overdue')
    })
  })

  describe('getHttpStatus', () => {
    it('should return HTTP-ready status', async () => {
      const status = await healthChecker.getHttpStatus()

      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('timestamp')
      expect(status).toHaveProperty('checks')
      expect(status).toHaveProperty('warnings')
      expect(status).toHaveProperty('errors')
    })

    it('should return healthy status', async () => {
      const status = await healthChecker.getHttpStatus()

      expect(status.status).toBe('healthy')
    })

    it('should return unhealthy status on error', async () => {
      mockSleepCycle.getState.mockReturnValue({
        status: 'failed',
        error: 'Test error'
      })

      const status = await healthChecker.getHttpStatus()

      expect(status.status).toBe('unhealthy')
    })
  })
})
