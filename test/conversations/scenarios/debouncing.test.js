import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), configure: vi.fn() },
  Logger: class { constructor() { this.debug = vi.fn(); this.info = vi.fn(); this.warn = vi.fn(); this.error = vi.fn(); this.configure = vi.fn() } }
}))

vi.mock('grammy', () => ({
  Bot: class {
    constructor() {
      this.api = {
        sendMessage: vi.fn().mockResolvedValue({}),
        sendChatAction: vi.fn().mockResolvedValue({}),
        getMe: vi.fn().mockResolvedValue({ id: 12345, username: 'test_bot' })
      }
    }
    on() {}
    async start() {}
    async stop() {}
  }
}))

import TelegramChannel from '../../../src/adapters/channels/telegram.js'
import { NervousSystem } from '../../../src/domain/nervous/index.js'

const USER = 'user-42'
const msg = (text, chatId = USER) => ({ text, chatId, userId: USER, timestamp: Date.now(), metadata: {} })

describe('Scenario: Message debouncing (Telegram)', () => {
  let bus, ch, received

  beforeEach(() => {
    vi.useFakeTimers()
    bus = new NervousSystem()
    ch = new TelegramChannel(bus, {
      token: 'fake',
      allowedUsers: [USER],
      allowedChatIds: [],
      debounceMs: 5000
    })
    received = []
    bus.on('message:in', m => received.push(m))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not publish before the debounce window expires', () => {
    ch._bufferOrPublish(msg('hola'))
    ch._bufferOrPublish(msg('como estas'))
    vi.advanceTimersByTime(4999)

    expect(received).toHaveLength(0)
  })

  it('batches three rapid messages into one bus event after 5s', () => {
    ch._bufferOrPublish(msg('Quiero hacer'))
    ch._bufferOrPublish(msg('una tarea'))
    ch._bufferOrPublish(msg('compleja'))

    vi.advanceTimersByTime(5000)

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('Quiero hacer\nuna tarea\ncompleja')
  })

  it('resets the window each time a new message arrives', () => {
    ch._bufferOrPublish(msg('primera parte'))
    vi.advanceTimersByTime(4000)          // 4s — still in window
    ch._bufferOrPublish(msg('segunda'))
    vi.advanceTimersByTime(4999)          // only 4999ms after the last message

    expect(received).toHaveLength(0)      // window not expired

    vi.advanceTimersByTime(1)             // now exactly 5000ms since last message

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('primera parte\nsegunda')
  })

  it('cancel command flushes pending batch, then fires cancel immediately', () => {
    ch._bufferOrPublish(msg('quiero que'))
    ch._bufferOrPublish(msg('stop'))

    // Both events emitted synchronously — no timer advance needed
    expect(received).toHaveLength(2)
    expect(received[0].text).toBe('quiero que')
    expect(received[1].text).toBe('stop')
  })

  it('_flushBuffer() drains pending messages immediately — no message lost on shutdown', () => {
    ch._bufferOrPublish(msg('mensaje incompleto'))
    expect(received).toHaveLength(0)     // still buffered

    ch._flushBuffer(USER)

    expect(received).toHaveLength(1)
    expect(received[0].text).toBe('mensaje incompleto')
  })

  it('debounceMs=0 disables buffering — every message fires immediately', () => {
    const instantCh = new TelegramChannel(bus, {
      token: 'fake',
      allowedUsers: [USER],
      allowedChatIds: [],
      debounceMs: 0
    })
    const instant = []
    bus.on('message:in', m => instant.push(m))

    instantCh._bufferOrPublish(msg('uno'))
    instantCh._bufferOrPublish(msg('dos'))
    instantCh._bufferOrPublish(msg('tres'))

    expect(instant).toHaveLength(3)
  })
})
