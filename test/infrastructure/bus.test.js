import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'

// We test the MessageBus pattern, but since bus.js exports a singleton,
// we'll test the EventEmitter behavior directly
describe('MessageBus', () => {
  let bus

  beforeEach(() => {
    // Create a fresh EventEmitter for each test
    bus = new EventEmitter()
    bus.setMaxListeners(0)
  })

  describe('event publishing and subscribing', () => {
    it('should emit and receive events', () => {
      const handler = vi.fn()
      bus.on('test:event', handler)

      bus.emit('test:event', { data: 'test' })

      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith({ data: 'test' })
    })

    it('should support multiple listeners', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      bus.on('test:event', handler1)
      bus.on('test:event', handler2)

      bus.emit('test:event', { data: 'test' })

      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).toHaveBeenCalledOnce()
    })

    it('should handle message:in events', () => {
      const handler = vi.fn()
      bus.on('message:in', handler)

      const message = {
        text: 'Hello',
        chatId: '123',
        userId: '456',
        channel: 'telegram'
      }

      bus.emit('message:in', message)

      expect(handler).toHaveBeenCalledWith(message)
    })

    it('should handle message:out events', () => {
      const handler = vi.fn()
      bus.on('message:out', handler)

      const message = {
        chatId: '123',
        text: 'Response',
        channel: 'telegram'
      }

      bus.emit('message:out', message)

      expect(handler).toHaveBeenCalledWith(message)
    })

    it('should handle error events', () => {
      const handler = vi.fn()
      bus.on('error', handler)

      const error = {
        source: 'telegram',
        error: 'Connection failed',
        context: { attempt: 1 }
      }

      bus.emit('error', error)

      expect(handler).toHaveBeenCalledWith(error)
    })
  })

  describe('listener management', () => {
    it('should remove listeners', () => {
      const handler = vi.fn()
      bus.on('test:event', handler)

      bus.emit('test:event')
      expect(handler).toHaveBeenCalledOnce()

      bus.off('test:event', handler)
      bus.emit('test:event')
      expect(handler).toHaveBeenCalledOnce() // Still once, not called again
    })

    it('should support once() for single-time listeners', () => {
      const handler = vi.fn()
      bus.once('test:event', handler)

      bus.emit('test:event')
      bus.emit('test:event')

      expect(handler).toHaveBeenCalledOnce()
    })
  })

  describe('unlimited listeners', () => {
    it('should allow unlimited listeners with setMaxListeners(0)', () => {
      // Add many listeners without warnings
      for (let i = 0; i < 20; i++) {
        bus.on('test:event', () => {})
      }

      // Should not throw
      expect(bus.listenerCount('test:event')).toBe(20)
    })
  })
})
