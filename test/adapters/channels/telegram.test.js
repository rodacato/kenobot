import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
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
})
