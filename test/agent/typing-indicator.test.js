import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NervousSystem } from '../../src/nervous/index.js'
import { withTypingIndicator } from '../../src/agent/typing-indicator.js'
import { THINKING_START } from '../../src/events.js'

vi.mock('../../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('withTypingIndicator', () => {
  let bus

  beforeEach(() => {
    bus = new NervousSystem()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should emit THINKING_START immediately', async () => {
    const events = []
    bus.on(THINKING_START, (p) => events.push(p))

    const promise = withTypingIndicator(bus, { chatId: '1', channel: 'test' }, async () => 'ok')
    // Immediate emission happens synchronously before the await
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ chatId: '1', channel: 'test' })

    await promise
  })

  it('should emit on interval', async () => {
    const events = []
    bus.on(THINKING_START, () => events.push(Date.now()))

    const promise = withTypingIndicator(bus, { chatId: '1', channel: 'test' }, async () => {
      await vi.advanceTimersByTimeAsync(8500)
      return 'done'
    }, 4000)

    const result = await promise

    expect(result).toBe('done')
    // 1 immediate + 2 intervals (at 4000ms and 8000ms)
    expect(events).toHaveLength(3)
  })

  it('should clear interval after fn completes', async () => {
    const events = []
    bus.on(THINKING_START, () => events.push(1))

    await withTypingIndicator(bus, { chatId: '1', channel: 'test' }, async () => 'ok', 4000)

    // After completion, advancing timers should not emit more events
    const countAfter = events.length
    vi.advanceTimersByTime(10000)
    expect(events).toHaveLength(countAfter)
  })

  it('should clear interval when fn throws', async () => {
    const events = []
    bus.on(THINKING_START, () => events.push(1))

    await expect(
      withTypingIndicator(bus, { chatId: '1', channel: 'test' }, async () => {
        throw new Error('boom')
      }, 4000)
    ).rejects.toThrow('boom')

    // After error, interval should be cleaned up
    const countAfter = events.length
    vi.advanceTimersByTime(10000)
    expect(events).toHaveLength(countAfter)
  })

  it('should return the result of the wrapped function', async () => {
    const result = await withTypingIndicator(bus, { chatId: '1', channel: 'test' }, async () => {
      return { content: 'hello', status: 200 }
    })

    expect(result).toEqual({ content: 'hello', status: 200 })
  })

  it('should use custom interval', async () => {
    const events = []
    bus.on(THINKING_START, () => events.push(1))

    const promise = withTypingIndicator(bus, { chatId: '1', channel: 'test' }, async () => {
      await vi.advanceTimersByTimeAsync(2500)
      return 'ok'
    }, 1000)

    await promise

    // 1 immediate + 2 intervals (at 1000ms and 2000ms)
    expect(events).toHaveLength(3)
  })
})
