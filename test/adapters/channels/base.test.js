import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { NervousSystem } from '../../../src/domain/nervous/index.js'
import logger from '../../../src/infrastructure/logger.js'
import BaseChannel from '../../../src/adapters/channels/base.js'
import { MESSAGE_IN } from '../../../src/infrastructure/events.js'

class TestChannel extends BaseChannel {
  async start() {}
  async stop() {}
  async send() {}
  get name() { return 'test' }
}

describe('BaseChannel', () => {
  let bus

  beforeEach(() => {
    bus = new NervousSystem()
    vi.clearAllMocks()
  })

  describe('_publishMessage', () => {
    it('should emit MESSAGE_IN for allowed users', () => {
      const channel = new TestChannel(bus, { allowedUsers: ['u1'] })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      channel._publishMessage({ text: 'hi', chatId: 'c1', userId: 'u1' })

      expect(emitted).toHaveLength(1)
      expect(emitted[0]).toEqual({ text: 'hi', chatId: 'c1', userId: 'u1', channel: 'test' })
    })

    it('should reject unauthorized users', () => {
      const channel = new TestChannel(bus, { allowedUsers: ['u1'] })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      channel._publishMessage({ text: 'hi', chatId: 'c1', userId: 'attacker' })

      expect(emitted).toHaveLength(0)
      expect(logger.warn).toHaveBeenCalledWith('channel', 'auth_rejected', expect.any(Object))
    })
  })

  describe('_isAllowed', () => {
    it('should allow users in allowedUsers', () => {
      const channel = new TestChannel(bus, { allowedUsers: ['u1', 'u2'] })
      expect(channel._isAllowed('u1', 'c1')).toBe(true)
      expect(channel._isAllowed('u3', 'c1')).toBe(false)
    })

    it('should allow chats in allowedChatIds', () => {
      const channel = new TestChannel(bus, { allowedChatIds: ['chat1'] })
      expect(channel._isAllowed('any-user', 'chat1')).toBe(true)
      expect(channel._isAllowed('any-user', 'chat2')).toBe(false)
    })

    it('should deny all when no allowlist configured', () => {
      const channel = new TestChannel(bus, {})
      expect(channel._isAllowed('u1', 'c1')).toBe(false)
    })

    it('should support legacy allowFrom', () => {
      const channel = new TestChannel(bus, { allowFrom: ['u1'] })
      expect(channel._isAllowed('u1', 'c1')).toBe(true)
      expect(channel._isAllowed('u2', 'c1')).toBe(false)
    })
  })

  describe('rate limiting', () => {
    it('should not rate limit when limits are 0 (default)', () => {
      const channel = new TestChannel(bus, { allowedUsers: ['u1'] })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      for (let i = 0; i < 100; i++) {
        channel._publishMessage({ text: 'hi', chatId: 'c1', userId: 'u1' })
      }

      expect(emitted).toHaveLength(100)
    })

    it('should rate limit per-minute', () => {
      const channel = new TestChannel(bus, {
        allowedUsers: ['u1'],
        rateLimit: { maxPerMinute: 3, maxPerHour: 0 }
      })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      for (let i = 0; i < 5; i++) {
        channel._publishMessage({ text: 'hi', chatId: 'c1', userId: 'u1' })
      }

      expect(emitted).toHaveLength(3)
      expect(logger.warn).toHaveBeenCalledWith('channel', 'rate_limited', {
        userId: 'u1',
        channel: 'test'
      })
    })

    it('should rate limit per-hour', () => {
      const channel = new TestChannel(bus, {
        allowedUsers: ['u1'],
        rateLimit: { maxPerMinute: 0, maxPerHour: 2 }
      })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      for (let i = 0; i < 4; i++) {
        channel._publishMessage({ text: 'hi', chatId: 'c1', userId: 'u1' })
      }

      expect(emitted).toHaveLength(2)
    })

    it('should track users independently', () => {
      const channel = new TestChannel(bus, {
        allowedUsers: ['u1', 'u2'],
        rateLimit: { maxPerMinute: 2, maxPerHour: 0 }
      })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      for (let i = 0; i < 3; i++) {
        channel._publishMessage({ text: 'hi', chatId: 'c1', userId: 'u1' })
        channel._publishMessage({ text: 'hi', chatId: 'c1', userId: 'u2' })
      }

      // Each user gets 2 messages (their own limit)
      expect(emitted).toHaveLength(4)
    })

    it('should allow messages after minute window expires', () => {
      vi.useFakeTimers()

      const channel = new TestChannel(bus, {
        allowedUsers: ['u1'],
        rateLimit: { maxPerMinute: 2, maxPerHour: 0 }
      })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      // Send 2 (at limit)
      channel._publishMessage({ text: 'a', chatId: 'c1', userId: 'u1' })
      channel._publishMessage({ text: 'b', chatId: 'c1', userId: 'u1' })
      // 3rd should be blocked
      channel._publishMessage({ text: 'c', chatId: 'c1', userId: 'u1' })
      expect(emitted).toHaveLength(2)

      // Advance past minute window
      vi.advanceTimersByTime(61000)

      // Should be allowed again
      channel._publishMessage({ text: 'd', chatId: 'c1', userId: 'u1' })
      expect(emitted).toHaveLength(3)

      vi.useRealTimers()
    })

    it('should prune old timestamps from buckets', () => {
      vi.useFakeTimers()

      const channel = new TestChannel(bus, {
        allowedUsers: ['u1'],
        rateLimit: { maxPerMinute: 0, maxPerHour: 2 }
      })
      const emitted = []
      bus.on(MESSAGE_IN, (msg) => emitted.push(msg))

      // Fill up the hour limit
      channel._publishMessage({ text: 'a', chatId: 'c1', userId: 'u1' })
      channel._publishMessage({ text: 'b', chatId: 'c1', userId: 'u1' })
      channel._publishMessage({ text: 'c', chatId: 'c1', userId: 'u1' })
      expect(emitted).toHaveLength(2)

      // Advance past hour window
      vi.advanceTimersByTime(3601000)

      // Old timestamps pruned, should be allowed
      channel._publishMessage({ text: 'd', chatId: 'c1', userId: 'u1' })
      expect(emitted).toHaveLength(3)

      vi.useRealTimers()
    })
  })

  describe('abstract methods', () => {
    it('should throw when start() not implemented', async () => {
      const channel = new BaseChannel(bus, {})
      await expect(channel.start()).rejects.toThrow('start() must be implemented')
    })

    it('should throw when stop() not implemented', async () => {
      const channel = new BaseChannel(bus, {})
      await expect(channel.stop()).rejects.toThrow('stop() must be implemented')
    })

    it('should throw when send() not implemented', async () => {
      const channel = new BaseChannel(bus, {})
      await expect(channel.send('c1', 'hi')).rejects.toThrow('send() must be implemented')
    })

    it('should throw when name getter not implemented', () => {
      const channel = new BaseChannel(bus, {})
      expect(() => channel.name).toThrow('name getter must be implemented')
    })
  })
})
