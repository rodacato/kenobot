import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Watchdog from '../src/watchdog.js'

vi.mock('../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('Watchdog', () => {
  let bus, watchdog

  beforeEach(() => {
    vi.useFakeTimers()
    bus = { emit: vi.fn(), fire: vi.fn() }
    watchdog = new Watchdog(bus, { interval: 1000 })
  })

  afterEach(() => {
    watchdog.stop()
    vi.useRealTimers()
  })

  describe('registerCheck', () => {
    it('should register a health check', () => {
      watchdog.registerCheck('test', () => ({ status: 'ok', detail: 'fine' }))

      const status = watchdog.getStatus()
      expect(status.checks.test).toBeDefined()
      expect(status.checks.test.status).toBe('unknown')
    })

    it('should support critical flag', () => {
      watchdog.registerCheck('db', () => ({ status: 'ok' }), { critical: true })

      const status = watchdog.getStatus()
      expect(status.checks.db.critical).toBe(true)
    })
  })

  describe('_runChecks', () => {
    it('should stay HEALTHY when all checks pass', async () => {
      watchdog.registerCheck('a', () => ({ status: 'ok', detail: 'good' }))
      watchdog.registerCheck('b', () => ({ status: 'ok', detail: 'good' }))

      await watchdog._runChecks()

      expect(watchdog.state).toBe('HEALTHY')
      expect(bus.fire).not.toHaveBeenCalled()
    })

    it('should transition to DEGRADED on non-critical failure', async () => {
      watchdog.registerCheck('a', () => ({ status: 'ok' }))
      watchdog.registerCheck('b', () => ({ status: 'fail', detail: 'disk slow' }))

      await watchdog._runChecks()

      expect(watchdog.state).toBe('DEGRADED')
      expect(bus.fire).toHaveBeenCalledWith('health:degraded', expect.objectContaining({
        previous: 'HEALTHY'
      }), { source: 'watchdog' })
    })

    it('should transition to DEGRADED on warning', async () => {
      watchdog.registerCheck('mem', () => ({ status: 'warn', detail: 'high usage' }))

      await watchdog._runChecks()

      expect(watchdog.state).toBe('DEGRADED')
      expect(bus.fire).toHaveBeenCalledWith('health:degraded', expect.anything(), { source: 'watchdog' })
    })

    it('should transition to UNHEALTHY on critical failure', async () => {
      watchdog.registerCheck('provider', () => ({ status: 'fail', detail: 'circuit OPEN' }), { critical: true })

      await watchdog._runChecks()

      expect(watchdog.state).toBe('UNHEALTHY')
      expect(bus.fire).toHaveBeenCalledWith('health:unhealthy', expect.objectContaining({
        previous: 'HEALTHY'
      }), { source: 'watchdog' })
    })

    it('should emit recovered when returning to HEALTHY', async () => {
      let failing = true
      watchdog.registerCheck('a', () => {
        if (failing) return { status: 'fail', detail: 'bad' }
        return { status: 'ok', detail: 'good' }
      })

      await watchdog._runChecks()
      expect(watchdog.state).toBe('DEGRADED')

      failing = false
      await watchdog._runChecks()

      expect(watchdog.state).toBe('HEALTHY')
      expect(bus.fire).toHaveBeenCalledWith('health:recovered', expect.objectContaining({
        previous: 'DEGRADED'
      }), { source: 'watchdog' })
    })

    it('should not emit when state unchanged', async () => {
      watchdog.registerCheck('a', () => ({ status: 'ok' }))

      await watchdog._runChecks()
      await watchdog._runChecks()

      // No emissions because state stayed HEALTHY (initial state)
      expect(bus.fire).not.toHaveBeenCalled()
    })

    it('should handle check function that throws', async () => {
      watchdog.registerCheck('broken', () => { throw new Error('check crashed') })

      await watchdog._runChecks()

      expect(watchdog.state).toBe('DEGRADED')
      const status = watchdog.getStatus()
      expect(status.checks.broken.status).toBe('fail')
      expect(status.checks.broken.detail).toBe('check crashed')
    })

    it('should handle async check functions', async () => {
      watchdog.registerCheck('async', async () => {
        return { status: 'ok', detail: 'async check passed' }
      })

      await watchdog._runChecks()

      expect(watchdog.state).toBe('HEALTHY')
      const status = watchdog.getStatus()
      expect(status.checks.async.detail).toBe('async check passed')
    })
  })

  describe('getStatus', () => {
    it('should return state, uptime, memory, and checks', () => {
      watchdog.registerCheck('test', () => ({ status: 'ok' }))

      const status = watchdog.getStatus()

      expect(status.state).toBe('HEALTHY')
      expect(status.uptime).toBeGreaterThanOrEqual(0)
      expect(status.memory.rss).toBeGreaterThan(0)
      expect(status.memory.heap).toBeGreaterThan(0)
      expect(status.checks.test).toBeDefined()
    })
  })

  describe('start/stop', () => {
    it('should not start twice', () => {
      watchdog.start()
      const timer1 = watchdog._timer
      watchdog.start()
      expect(watchdog._timer).toBe(timer1)
    })

    it('should clear timer on stop', () => {
      watchdog.start()
      expect(watchdog._timer).not.toBeNull()

      watchdog.stop()
      expect(watchdog._timer).toBeNull()
    })
  })
})
