import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import MessageBatcher from '../../../../src/domain/cognitive/utils/message-batcher.js'

describe('MessageBatcher', () => {
  let batcher

  beforeEach(() => {
    vi.useFakeTimers()
    batcher = new MessageBatcher({ defaultDebounceMs: 2000, maxWaitMs: 10000 })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    batcher.clearAll()
  })

  describe('add', () => {
    it('should batch messages and flush after debounce', async () => {
      batcher.add('session-1', 'wait...')
      batcher.add('session-1', 'ok...')

      expect(batcher.getBatchSize('session-1')).toBe(2)

      // Advance time past debounce and await timers
      await vi.advanceTimersByTimeAsync(2000)

      expect(batcher.getBatchSize('session-1')).toBe(0)
    })

    it('should flush immediately for complete messages', async () => {
      const promise = batcher.add('session-1', 'Complete sentence here!')

      const messages = await promise
      expect(messages).toEqual(['Complete sentence here!'])
    })

    it('should not flush immediately for incomplete messages', async () => {
      const promise = batcher.add('session-1', 'Wait...')

      expect(batcher.hasPendingBatch('session-1')).toBe(true)

      vi.advanceTimersByTime(2000)
      const messages = await promise

      expect(messages).toEqual(['Wait...'])
    })

    it('should flush after max wait time', async () => {
      batcher.add('session-1', 'First...')
      batcher.add('session-1', 'Second...')

      expect(batcher.getBatchSize('session-1')).toBe(2)

      // Advance past max wait
      await vi.advanceTimersByTimeAsync(10000)

      expect(batcher.getBatchSize('session-1')).toBe(0)
    })

    it('should handle multiple sessions independently', async () => {
      const promise1 = batcher.add('session-1', 'wait...')
      const promise2 = batcher.add('session-2', 'hold on...')

      expect(batcher.getBatchSize('session-1')).toBe(1)
      expect(batcher.getBatchSize('session-2')).toBe(1)

      vi.advanceTimersByTime(2000)

      await Promise.all([promise1, promise2])

      expect(batcher.getBatchSize('session-1')).toBe(0)
      expect(batcher.getBatchSize('session-2')).toBe(0)
    })
  })

  describe('shouldFlushImmediately', () => {
    it('should return false for messages ending with ...', () => {
      expect(batcher.shouldFlushImmediately('Wait...')).toBe(false)
      expect(batcher.shouldFlushImmediately('Hold on...')).toBe(false)
    })

    it('should return false for messages with "wait"', () => {
      expect(batcher.shouldFlushImmediately('wait a moment')).toBe(false)
      expect(batcher.shouldFlushImmediately('please wait')).toBe(false)
    })

    it('should return false for very short messages', () => {
      expect(batcher.shouldFlushImmediately('ok')).toBe(false)
      expect(batcher.shouldFlushImmediately('yes')).toBe(false)
    })

    it('should return true for complete messages', () => {
      expect(batcher.shouldFlushImmediately('This is a complete message')).toBe(true)
      expect(batcher.shouldFlushImmediately('Hello world!')).toBe(true)
    })

    it('should handle Spanish incomplete indicators', () => {
      expect(batcher.shouldFlushImmediately('espera un momento')).toBe(false)
      expect(batcher.shouldFlushImmediately('un momento por favor')).toBe(false)
    })
  })

  describe('flush', () => {
    it('should return messages and clear batch', () => {
      // Add messages without awaiting to keep them in batch
      batcher.add('session-1', 'wait...')
      batcher.add('session-1', 'hold on...')

      const messages = batcher.flush('session-1')

      expect(messages).toEqual(['wait...', 'hold on...'])
      expect(batcher.getBatchSize('session-1')).toBe(0)
    })

    it('should return empty array for non-existent session', () => {
      const messages = batcher.flush('non-existent')

      expect(messages).toEqual([])
    })
  })

  describe('clearAll', () => {
    it('should clear all batches', () => {
      batcher.add('session-1', 'wait...')
      batcher.add('session-2', 'hold on...')

      batcher.clearAll()

      expect(batcher.getBatchSize('session-1')).toBe(0)
      expect(batcher.getBatchSize('session-2')).toBe(0)
    })
  })
})
