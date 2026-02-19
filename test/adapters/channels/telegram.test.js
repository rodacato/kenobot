import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import TelegramChannel from '../../../src/adapters/channels/telegram.js'
import { NervousSystem } from '../../../src/domain/nervous/index.js'

describe('TelegramChannel', () => {
  let channel
  let bus

  beforeEach(() => {
    bus = new NervousSystem()
    // Don't start the bot in tests, just instantiate for testing methods
    channel = new TelegramChannel(bus, {
      token: 'fake_token_for_testing',
      allowFrom: ['123456789']
    })
  })

  describe('_chunkMessage()', () => {
    it('should return single chunk for short messages', () => {
      const message = 'Hello world'
      const chunks = channel._chunkMessage(message, 4000)

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBe('Hello world')
    })

    it('should split long messages into chunks', () => {
      const longMessage = 'A'.repeat(5000)
      const chunks = channel._chunkMessage(longMessage, 4000)

      expect(chunks.length).toBeGreaterThan(1)
      expect(chunks[0]).toHaveLength(4000)
      expect(chunks[1]).toHaveLength(1000)
    })

    it('should split by lines to avoid breaking words', () => {
      const message = Array(100).fill('Line of text').join('\n')
      const chunks = channel._chunkMessage(message, 500)

      // Each chunk should end with complete lines
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(500)
      }
    })

    it('should handle very long single lines', () => {
      const longLine = 'A'.repeat(5000)
      const chunks = channel._chunkMessage(longLine, 4000)

      expect(chunks.length).toBeGreaterThan(1)
      // First chunk should be exactly 4000
      expect(chunks[0]).toHaveLength(4000)
    })

    it('should preserve newlines in chunks', () => {
      const message = 'Line 1\nLine 2\nLine 3'
      const chunks = channel._chunkMessage(message, 1000)

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBe('Line 1\nLine 2\nLine 3')
    })

    it('should handle empty messages', () => {
      const chunks = channel._chunkMessage('', 4000)

      // Empty strings return a single empty chunk (defensive behavior)
      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toBe('')
    })

    it('should handle messages at exact limit', () => {
      const message = 'A'.repeat(4000)
      const chunks = channel._chunkMessage(message, 4000)

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toHaveLength(4000)
    })

    it('should handle message just over limit', () => {
      const message = 'A'.repeat(4001)
      const chunks = channel._chunkMessage(message, 4000)

      expect(chunks).toHaveLength(2)
      expect(chunks[0]).toHaveLength(4000)
      expect(chunks[1]).toHaveLength(1)
    })

    it('should trim chunks properly', () => {
      const message = 'Line 1\n\nLine 2\n\nLine 3'
      const chunks = channel._chunkMessage(message, 1000)

      // Chunks should be trimmed
      for (const chunk of chunks) {
        expect(chunk).toBe(chunk.trim())
      }
    })
  })

  describe('name', () => {
    it('should return correct channel name', () => {
      expect(channel.name).toBe('telegram')
    })
  })

  describe('_isAllowed (dual auth)', () => {
    it('should allow user in allowedUsers list', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: ['111'],
        allowedChatIds: [],
      })
      expect(ch._isAllowed('111', '-1001234')).toBe(true)
    })

    it('should allow anyone in allowedChatIds', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: [],
        allowedChatIds: ['-1001234'],
      })
      expect(ch._isAllowed('999', '-1001234')).toBe(true)
    })

    it('should reject unknown user in non-allowed chat', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: ['111'],
        allowedChatIds: ['-1001234'],
      })
      expect(ch._isAllowed('999', '-9999')).toBe(false)
    })

    it('should reject when no allowlist configured', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: [],
        allowedChatIds: [],
      })
      expect(ch._isAllowed('111', '111')).toBe(false)
    })

    it('should support legacy allowFrom config', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowFrom: ['111'],
      })
      expect(ch._isAllowed('111', '111')).toBe(true)
      expect(ch._isAllowed('222', '222')).toBe(false)
    })
  })

  describe('_publishMessage (auth integration)', () => {
    it('should emit message:in for allowed user', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: ['111'],
        allowedChatIds: [],
      })
      const emitted = []
      bus.on('message:in', (msg) => emitted.push(msg))

      ch._publishMessage({ text: 'hi', chatId: '111', userId: '111', timestamp: 1 })

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('hi')
    })

    it('should not emit for unauthorized user', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: ['111'],
        allowedChatIds: [],
      })
      const emitted = []
      bus.on('message:in', (msg) => emitted.push(msg))

      ch._publishMessage({ text: 'hi', chatId: '999', userId: '999', timestamp: 1 })

      expect(emitted).toHaveLength(0)
    })

    it('should allow user in allowed group chat even if not in allowedUsers', () => {
      const ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: [],
        allowedChatIds: ['-1001234'],
      })
      const emitted = []
      bus.on('message:in', (msg) => emitted.push(msg))

      ch._publishMessage({ text: 'hi', chatId: '-1001234', userId: '999', timestamp: 1 })

      expect(emitted).toHaveLength(1)
    })
  })

  describe('_bufferOrPublish (debouncing)', () => {
    const msg = (text, chatId = '111') => ({
      text, chatId, userId: '111', timestamp: Date.now(), metadata: {}
    })

    let ch

    beforeEach(() => {
      vi.useFakeTimers()
      ch = new TelegramChannel(bus, {
        token: 'fake',
        allowedUsers: ['111'],
        allowedChatIds: [],
        debounceMs: 1500
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('fires immediately when debounceMs is 0', () => {
      const instant = new TelegramChannel(bus, {
        token: 'fake', allowedUsers: ['111'], allowedChatIds: [], debounceMs: 0
      })
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      instant._bufferOrPublish(msg('hello'))

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('hello')
    })

    it('does not fire before window expires', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('hello'))
      vi.advanceTimersByTime(1499)

      expect(emitted).toHaveLength(0)
    })

    it('fires single message after window expires', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('hello'))
      vi.advanceTimersByTime(1500)

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('hello')
    })

    it('batches two rapid messages into one', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('hola'))
      vi.advanceTimersByTime(500)
      ch._bufferOrPublish(msg('como estas'))
      vi.advanceTimersByTime(1500)

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('hola\ncomo estas')
    })

    it('batches three rapid messages into one', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('parte 1'))
      ch._bufferOrPublish(msg('parte 2'))
      ch._bufferOrPublish(msg('parte 3'))
      vi.advanceTimersByTime(1500)

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('parte 1\nparte 2\nparte 3')
    })

    it('resets window on each new message', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('a'))
      vi.advanceTimersByTime(1000)
      ch._bufferOrPublish(msg('b'))
      vi.advanceTimersByTime(1000)    // only 1000ms after last message
      expect(emitted).toHaveLength(0) // window not expired yet
      vi.advanceTimersByTime(500)     // now 1500ms after last message

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('a\nb')
    })

    it('keeps messages from different chats independent', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      const ch2 = new TelegramChannel(bus, {
        token: 'fake', allowedUsers: ['222'], allowedChatIds: [], debounceMs: 1500
      })

      ch._bufferOrPublish(msg('hello', '111'))
      ch2._bufferOrPublish({ text: 'world', chatId: '222', userId: '222', timestamp: Date.now(), metadata: {} })
      vi.advanceTimersByTime(1500)

      expect(emitted).toHaveLength(2)
      const texts = emitted.map(e => e.text)
      expect(texts).toContain('hello')
      expect(texts).toContain('world')
    })

    it('cancel command bypasses buffer and fires immediately', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('para'))

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('para')
    })

    it('cancel flushes pending batch before firing', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('quiero que'))
      ch._bufferOrPublish(msg('stop'))

      expect(emitted).toHaveLength(2)
      expect(emitted[0].text).toBe('quiero que')
      expect(emitted[1].text).toBe('stop')
    })

    it('all cancel variants bypass buffer', () => {
      for (const word of ['para', 'stop', 'cancel', 'cancelar', 'STOP', 'Para']) {
        const localBus = new (Object.getPrototypeOf(bus).constructor)()
        const localCh = new TelegramChannel(localBus, {
          token: 'fake', allowedUsers: ['111'], allowedChatIds: [], debounceMs: 1500
        })
        const emitted = []
        localBus.on('message:in', m => emitted.push(m))

        localCh._bufferOrPublish(msg(word))

        expect(emitted).toHaveLength(1)
      }
    })

    it('flushes pending buffer when _flushBuffer is called directly', () => {
      const emitted = []
      bus.on('message:in', m => emitted.push(m))

      ch._bufferOrPublish(msg('mensaje pendiente'))
      expect(emitted).toHaveLength(0)

      ch._flushBuffer('111')

      expect(emitted).toHaveLength(1)
      expect(emitted[0].text).toBe('mensaje pendiente')
    })

    it('attempts typing action when second message arrives in buffer', () => {
      const typingCalls = []
      ch.bot = {
        api: {
          sendChatAction: vi.fn().mockImplementation((chatId, action) => {
            typingCalls.push({ chatId, action })
            return Promise.resolve()
          })
        }
      }

      ch._bufferOrPublish(msg('mensaje 1'))
      ch._bufferOrPublish(msg('mensaje 2'))

      expect(typingCalls).toHaveLength(1)
      expect(typingCalls[0].action).toBe('typing')
    })

    it('ignores typing action errors gracefully', () => {
      ch.bot = {
        api: {
          sendChatAction: vi.fn().mockImplementation(() => { throw new Error('network') })
        }
      }

      expect(() => {
        ch._bufferOrPublish(msg('msg 1'))
        ch._bufferOrPublish(msg('msg 2'))
      }).not.toThrow()
    })
  })
})
