import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { NervousSystem } from '../../src/nervous/index.js'
import Signal from '../../src/nervous/signal.js'

describe('NervousSystem', () => {
  let nervous

  beforeEach(() => {
    nervous = new NervousSystem()
  })

  describe('fire', () => {
    it('should deliver payload to listeners', () => {
      const received = []
      nervous.on('message:in', (payload) => received.push(payload))

      nervous.fire('message:in', { text: 'hello', chatId: '123' }, { source: 'telegram' })

      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ text: 'hello', chatId: '123' })
    })

    it('should return a Signal object', () => {
      const signal = nervous.fire('message:in', { text: 'hi' }, { source: 'test' })

      expect(signal).toBeInstanceOf(Signal)
      expect(signal.type).toBe('message:in')
      expect(signal.source).toBe('test')
      expect(signal.traceId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('should accept custom traceId', () => {
      const signal = nervous.fire('test', {}, { source: 'a', traceId: 'custom-123' })

      expect(signal.traceId).toBe('custom-123')
    })

    it('should support multiple listeners (same as EventEmitter)', () => {
      const h1 = vi.fn()
      const h2 = vi.fn()
      nervous.on('test', h1)
      nervous.on('test', h2)

      nervous.fire('test', { data: 1 })

      expect(h1).toHaveBeenCalledWith({ data: 1 })
      expect(h2).toHaveBeenCalledWith({ data: 1 })
    })
  })

  describe('backward compatibility', () => {
    it('should support on/off/once from EventEmitter', () => {
      const handler = vi.fn()
      nervous.on('test', handler)
      nervous.fire('test', { a: 1 })
      expect(handler).toHaveBeenCalledOnce()

      nervous.off('test', handler)
      nervous.fire('test', { a: 2 })
      expect(handler).toHaveBeenCalledOnce()
    })

    it('should support emit() for backward compat', () => {
      const handler = vi.fn()
      nervous.on('test', handler)

      // Direct emit still works (bypasses middleware)
      nervous.emit('test', { legacy: true })

      expect(handler).toHaveBeenCalledWith({ legacy: true })
    })

    it('should allow unlimited listeners', () => {
      for (let i = 0; i < 50; i++) {
        nervous.on('test', () => {})
      }
      expect(nervous.listenerCount('test')).toBe(50)
    })
  })

  describe('middleware', () => {
    it('should run middleware on fire()', () => {
      const mw = vi.fn()
      nervous.use(mw)

      nervous.fire('test', { data: 1 }, { source: 'unit' })

      expect(mw).toHaveBeenCalledOnce()
      const signal = mw.mock.calls[0][0]
      expect(signal).toBeInstanceOf(Signal)
      expect(signal.type).toBe('test')
      expect(signal.source).toBe('unit')
    })

    it('should run middleware in registration order', () => {
      const order = []
      nervous.use(() => order.push('first'))
      nervous.use(() => order.push('second'))
      nervous.use(() => order.push('third'))

      nervous.fire('test', {})

      expect(order).toEqual(['first', 'second', 'third'])
    })

    it('should inhibit signal when middleware returns false', () => {
      const handler = vi.fn()
      nervous.on('test', handler)
      nervous.use(() => false)

      const result = nervous.fire('test', {})

      expect(result).toBe(false)
      expect(handler).not.toHaveBeenCalled()
    })

    it('should not run subsequent middleware after inhibition', () => {
      const mw1 = vi.fn(() => false)
      const mw2 = vi.fn()
      nervous.use(mw1)
      nervous.use(mw2)

      nervous.fire('test', {})

      expect(mw1).toHaveBeenCalled()
      expect(mw2).not.toHaveBeenCalled()
    })

    it('should NOT run middleware on direct emit()', () => {
      const mw = vi.fn()
      nervous.use(mw)

      nervous.emit('test', {})

      expect(mw).not.toHaveBeenCalled()
    })
  })

  describe('stats', () => {
    it('should track fired signal count', () => {
      nervous.fire('a', {})
      nervous.fire('b', {})
      nervous.fire('a', {})

      const stats = nervous.getStats()
      expect(stats.fired).toBe(3)
      expect(stats.byType).toEqual({ a: 2, b: 1 })
    })

    it('should track inhibited signals', () => {
      nervous.use(() => false)
      nervous.fire('test', {})
      nervous.fire('test', {})

      const stats = nervous.getStats()
      expect(stats.inhibited).toBe(2)
      expect(stats.fired).toBe(0)
    })

    it('should return a copy (not reference)', () => {
      nervous.fire('a', {})
      const stats1 = nervous.getStats()
      nervous.fire('b', {})
      const stats2 = nervous.getStats()

      expect(stats1.fired).toBe(1)
      expect(stats2.fired).toBe(2)
    })
  })

  describe('audit trail', () => {
    it('should return null when no dataDir configured', () => {
      expect(nervous.getAuditTrail()).toBeNull()
    })

    it('should create audit trail when dataDir provided', () => {
      const ns = new NervousSystem({ dataDir: '/tmp/test' })
      expect(ns.getAuditTrail()).not.toBeNull()
    })

    it('should respect audit=false override', () => {
      const ns = new NervousSystem({ dataDir: '/tmp/test', audit: false })
      expect(ns.getAuditTrail()).toBeNull()
    })
  })

  describe('integration', () => {
    it('should support full signal flow: fire → middleware → listener', () => {
      const events = []
      const mw = (signal) => { events.push(`mw:${signal.type}`) }
      const handler = (payload) => { events.push(`handler:${payload.text}`) }

      nervous.use(mw)
      nervous.on('message:in', handler)

      nervous.fire('message:in', { text: 'hello' }, { source: 'telegram' })

      expect(events).toEqual(['mw:message:in', 'handler:hello'])
    })

    it('should support trace propagation end-to-end', async () => {
      const { createTraceMiddleware } = await import('../../src/nervous/middleware.js')
      nervous.use(createTraceMiddleware())

      let inTraceId, outTraceId

      // Fire message in
      const inSignal = nervous.fire('message:in', { chatId: '42', text: 'hi' }, { source: 'telegram' })
      inTraceId = inSignal.traceId

      // Fire message out for same chatId
      const outSignal = nervous.fire('message:out', { chatId: '42', text: 'reply' }, { source: 'agent' })
      outTraceId = outSignal.traceId

      // Trace middleware should have linked them
      expect(outTraceId).toBe(inTraceId)
    })
  })
})
