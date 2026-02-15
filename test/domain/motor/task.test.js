import { describe, it, expect, beforeEach, vi } from 'vitest'
import Task from '../../../src/domain/motor/task.js'

describe('Task', () => {
  let taskData

  beforeEach(() => {
    taskData = {
      chatId: 'chat-123',
      channel: 'telegram',
      sessionId: 'session-456',
      input: 'test message'
    }
  })

  describe('constructor', () => {
    it('sets id, status=queued, all fields populated, isActive=true', () => {
      const task = new Task(taskData)

      expect(task.id).toMatch(/^[a-f0-9]{16}$/)
      expect(task.chatId).toBe('chat-123')
      expect(task.channel).toBe('telegram')
      expect(task.sessionId).toBe('session-456')
      expect(task.input).toBe('test message')
      expect(task.status).toBe('queued')
      expect(task.steps).toEqual([])
      expect(task.result).toBeNull()
      expect(task.error).toBeNull()
      expect(task.createdAt).toBeTypeOf('number')
      expect(task.updatedAt).toBeTypeOf('number')
      expect(task.isActive).toBe(true)
    })

    it('generates unique ids for different tasks', () => {
      const task1 = new Task(taskData)
      const task2 = new Task(taskData)

      expect(task1.id).not.toBe(task2.id)
    })
  })

  describe('start()', () => {
    it('transitions to started, isActive=true', () => {
      const task = new Task(taskData)
      const initialUpdatedAt = task.updatedAt

      vi.useFakeTimers()
      vi.advanceTimersByTime(100)

      task.start()

      expect(task.status).toBe('started')
      expect(task.isActive).toBe(true)
      expect(task.updatedAt).toBeGreaterThan(initialUpdatedAt)

      vi.useRealTimers()
    })

    it('throws when already started', () => {
      const task = new Task(taskData)
      task.start()

      expect(() => task.start()).toThrow('Cannot transition from "started" to "started"')
    })

    it('throws when completed', () => {
      const task = new Task(taskData)
      task.start()
      task.complete({ output: 'done' })

      expect(() => task.start()).toThrow('Cannot transition from "completed" to "started"')
    })

    it('throws when failed', () => {
      const task = new Task(taskData)
      task.fail('error occurred')

      expect(() => task.start()).toThrow('Cannot transition from "failed" to "started"')
    })

    it('throws when cancelled', () => {
      const task = new Task(taskData)
      task.cancel()

      expect(() => task.start()).toThrow('Cannot transition from "cancelled" to "started"')
    })
  })

  describe('addStep()', () => {
    it('adds step with timestamp', () => {
      const task = new Task(taskData)
      const step = { tool: 'read', args: { file: 'test.js' } }

      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      task.addStep(step)

      expect(task.steps).toHaveLength(1)
      expect(task.steps[0]).toEqual({
        tool: 'read',
        args: { file: 'test.js' },
        ts: now
      })

      vi.useRealTimers()
    })

    it('updates updatedAt timestamp', () => {
      const task = new Task(taskData)
      const initialUpdatedAt = task.updatedAt

      vi.useFakeTimers()
      vi.advanceTimersByTime(100)

      task.addStep({ tool: 'bash', args: { cmd: 'ls' } })

      expect(task.updatedAt).toBeGreaterThan(initialUpdatedAt)

      vi.useRealTimers()
    })

    it('adds multiple steps preserving order', () => {
      const task = new Task(taskData)

      task.addStep({ tool: 'read', file: 'a.js' })
      task.addStep({ tool: 'edit', file: 'b.js' })
      task.addStep({ tool: 'bash', cmd: 'test' })

      expect(task.steps).toHaveLength(3)
      expect(task.steps[0].tool).toBe('read')
      expect(task.steps[1].tool).toBe('edit')
      expect(task.steps[2].tool).toBe('bash')
    })
  })

  describe('complete()', () => {
    it('transitions to completed, stores result, isActive=false', () => {
      const task = new Task(taskData)
      task.start()

      const result = { output: 'task completed successfully' }
      task.complete(result)

      expect(task.status).toBe('completed')
      expect(task.result).toEqual(result)
      expect(task.isActive).toBe(false)
    })

    it('throws when queued (must start first)', () => {
      const task = new Task(taskData)

      expect(() => task.complete({ output: 'done' })).toThrow(
        'Cannot transition from "queued" to "completed"'
      )
    })

    it('throws when already completed', () => {
      const task = new Task(taskData)
      task.start()
      task.complete({ output: 'done' })

      expect(() => task.complete({ output: 'done again' })).toThrow(
        'Cannot transition from "completed" to "completed"'
      )
    })

    it('throws when failed', () => {
      const task = new Task(taskData)
      task.start()
      task.fail('error')

      expect(() => task.complete({ output: 'done' })).toThrow(
        'Cannot transition from "failed" to "completed"'
      )
    })

    it('throws when cancelled', () => {
      const task = new Task(taskData)
      task.start()
      task.cancel()

      expect(() => task.complete({ output: 'done' })).toThrow(
        'Cannot transition from "cancelled" to "completed"'
      )
    })
  })

  describe('fail()', () => {
    it('transitions to failed, stores error message from queued', () => {
      const task = new Task(taskData)

      task.fail('something went wrong')

      expect(task.status).toBe('failed')
      expect(task.error).toBe('something went wrong')
      expect(task.isActive).toBe(false)
    })

    it('transitions to failed from started', () => {
      const task = new Task(taskData)
      task.start()

      task.fail('error during execution')

      expect(task.status).toBe('failed')
      expect(task.error).toBe('error during execution')
      expect(task.isActive).toBe(false)
    })

    it('extracts message from Error object', () => {
      const task = new Task(taskData)

      task.fail(new Error('database connection failed'))

      expect(task.status).toBe('failed')
      expect(task.error).toBe('database connection failed')
    })

    it('handles error objects without message property', () => {
      const task = new Task(taskData)

      task.fail({ code: 'ERR_TIMEOUT' })

      expect(task.status).toBe('failed')
      expect(task.error).toBe('[object Object]')
    })

    it('throws when already completed', () => {
      const task = new Task(taskData)
      task.start()
      task.complete({ output: 'done' })

      expect(() => task.fail('too late')).toThrow(
        'Cannot transition from "completed" to "failed"'
      )
    })

    it('throws when already cancelled', () => {
      const task = new Task(taskData)
      task.cancel()

      expect(() => task.fail('error')).toThrow(
        'Cannot transition from "cancelled" to "failed"'
      )
    })
  })

  describe('cancel()', () => {
    it('transitions to cancelled, isCancelled=true, isActive=false from queued', () => {
      const task = new Task(taskData)

      task.cancel()

      expect(task.status).toBe('cancelled')
      expect(task.isCancelled).toBe(true)
      expect(task.isActive).toBe(false)
    })

    it('transitions to cancelled from started', () => {
      const task = new Task(taskData)
      task.start()

      task.cancel()

      expect(task.status).toBe('cancelled')
      expect(task.isCancelled).toBe(true)
      expect(task.isActive).toBe(false)
    })

    it('throws when already completed', () => {
      const task = new Task(taskData)
      task.start()
      task.complete({ output: 'done' })

      expect(() => task.cancel()).toThrow(
        'Cannot transition from "completed" to "cancelled"'
      )
    })

    it('throws when already failed', () => {
      const task = new Task(taskData)
      task.fail('error')

      expect(() => task.cancel()).toThrow(
        'Cannot transition from "failed" to "cancelled"'
      )
    })
  })

  describe('toJSON()', () => {
    it('returns serializable object', () => {
      const task = new Task(taskData)
      task.start()
      task.addStep({ tool: 'read', file: 'test.js' })

      const json = task.toJSON()

      expect(json).toMatchObject({
        id: task.id,
        chatId: 'chat-123',
        channel: 'telegram',
        sessionId: 'session-456',
        input: 'test message',
        status: 'started',
        steps: 1,
        result: null,
        error: null,
      })
      expect(json.createdAt).toBeTypeOf('number')
      expect(json.updatedAt).toBeTypeOf('number')
    })
  })

  describe('isActive', () => {
    it('returns true for queued status', () => {
      const task = new Task(taskData)
      expect(task.isActive).toBe(true)
    })

    it('returns true for started status', () => {
      const task = new Task(taskData)
      task.start()
      expect(task.isActive).toBe(true)
    })

    it('returns false for completed status', () => {
      const task = new Task(taskData)
      task.start()
      task.complete({ output: 'done' })
      expect(task.isActive).toBe(false)
    })

    it('returns false for failed status', () => {
      const task = new Task(taskData)
      task.fail('error')
      expect(task.isActive).toBe(false)
    })

    it('returns false for cancelled status', () => {
      const task = new Task(taskData)
      task.cancel()
      expect(task.isActive).toBe(false)
    })
  })

  describe('isCancelled', () => {
    it('returns true only for cancelled status', () => {
      const task = new Task(taskData)
      expect(task.isCancelled).toBe(false)

      task.start()
      expect(task.isCancelled).toBe(false)

      task.cancel()
      expect(task.isCancelled).toBe(true)
    })

    it('returns false for other statuses', () => {
      const queuedTask = new Task(taskData)
      expect(queuedTask.isCancelled).toBe(false)

      const completedTask = new Task(taskData)
      completedTask.start()
      completedTask.complete({ output: 'done' })
      expect(completedTask.isCancelled).toBe(false)

      const failedTask = new Task(taskData)
      failedTask.fail('error')
      expect(failedTask.isCancelled).toBe(false)
    })
  })
})
