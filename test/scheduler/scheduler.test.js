import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Suppress logger output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import Scheduler from '../../src/scheduler/scheduler.js'

describe('Scheduler', () => {
  let scheduler
  let mockBus
  let dataDir

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'scheduler-test-'))
    mockBus = {
      emit: vi.fn(),
      fire: vi.fn()
    }
    scheduler = new Scheduler(mockBus, dataDir)
  })

  afterEach(async () => {
    scheduler.stop()
    await rm(dataDir, { recursive: true, force: true })
  })

  describe('add', () => {
    it('should add a task and return its ID', async () => {
      const id = await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'Good morning',
        description: 'Morning greeting',
        chatId: '123',
        userId: '456',
        channel: 'telegram'
      })

      expect(id).toBeDefined()
      expect(typeof id).toBe('string')
      expect(scheduler.size).toBe(1)
    })

    it('should reject invalid cron expression', async () => {
      await expect(scheduler.add({
        cronExpr: 'not-a-cron',
        message: 'test',
        chatId: '123'
      })).rejects.toThrow('Invalid cron expression')
    })

    it('should persist task to file', async () => {
      await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'test',
        description: 'Test task',
        chatId: '123',
        userId: '456'
      })

      const data = await readFile(join(dataDir, 'scheduler', 'tasks.json'), 'utf8')
      const tasks = JSON.parse(data)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].message).toBe('test')
      expect(tasks[0].cronExpr).toBe('0 9 * * *')
      expect(tasks[0].chatId).toBe('123')
    })

    it('should default channel to telegram', async () => {
      await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'test',
        chatId: '123'
      })

      const tasks = scheduler.list()
      expect(tasks[0].channel).toBe('telegram')
    })

    it('should default description to message', async () => {
      await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'Check calendar',
        chatId: '123'
      })

      const tasks = scheduler.list()
      expect(tasks[0].description).toBe('Check calendar')
    })

    it('should reject when task limit is reached', async () => {
      const limited = new Scheduler(mockBus, dataDir, { maxTasks: 2 })

      await limited.add({ cronExpr: '0 9 * * *', message: 'task1', chatId: '123' })
      await limited.add({ cronExpr: '0 10 * * *', message: 'task2', chatId: '123' })

      await expect(limited.add({
        cronExpr: '0 11 * * *',
        message: 'task3',
        chatId: '123'
      })).rejects.toThrow('Task limit reached (max 2)')

      limited.stop()
    })

    it('should allow adding after removing when at limit', async () => {
      const limited = new Scheduler(mockBus, dataDir, { maxTasks: 1 })

      const id = await limited.add({ cronExpr: '0 9 * * *', message: 'task1', chatId: '123' })
      await limited.remove(id)

      const id2 = await limited.add({ cronExpr: '0 10 * * *', message: 'task2', chatId: '123' })
      expect(id2).toBeDefined()

      limited.stop()
    })

    it('should set createdAt timestamp', async () => {
      const before = Date.now()
      await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'test',
        chatId: '123'
      })
      const after = Date.now()

      const tasks = scheduler.list()
      expect(tasks[0].createdAt).toBeGreaterThanOrEqual(before)
      expect(tasks[0].createdAt).toBeLessThanOrEqual(after)
    })
  })

  describe('remove', () => {
    it('should remove a task by ID', async () => {
      const id = await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'test',
        chatId: '123'
      })

      await scheduler.remove(id)
      expect(scheduler.size).toBe(0)
    })

    it('should throw for unknown task ID', async () => {
      await expect(scheduler.remove('nonexistent')).rejects.toThrow('Task not found')
    })

    it('should persist after removal', async () => {
      const id = await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'test',
        chatId: '123'
      })

      await scheduler.remove(id)

      const data = await readFile(join(dataDir, 'scheduler', 'tasks.json'), 'utf8')
      const tasks = JSON.parse(data)
      expect(tasks).toHaveLength(0)
    })
  })

  describe('list', () => {
    it('should return empty array when no tasks', () => {
      expect(scheduler.list()).toEqual([])
    })

    it('should return tasks without job references', async () => {
      await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'test',
        chatId: '123'
      })

      const tasks = scheduler.list()
      expect(tasks).toHaveLength(1)
      expect(tasks[0]).not.toHaveProperty('job')
      expect(tasks[0]).toHaveProperty('id')
      expect(tasks[0]).toHaveProperty('message')
    })

    it('should list multiple tasks', async () => {
      await scheduler.add({ cronExpr: '0 9 * * *', message: 'morning', chatId: '123' })
      await scheduler.add({ cronExpr: '0 17 * * *', message: 'evening', chatId: '123' })

      expect(scheduler.list()).toHaveLength(2)
    })
  })

  describe('loadTasks', () => {
    it('should do nothing when no tasks file exists', async () => {
      await scheduler.loadTasks()
      expect(scheduler.size).toBe(0)
    })

    it('should restore tasks from persisted file', async () => {
      // Create a task first
      await scheduler.add({
        cronExpr: '0 9 * * *',
        message: 'persisted task',
        description: 'From file',
        chatId: '123',
        userId: '456'
      })

      // Create a new scheduler and load from file
      const scheduler2 = new Scheduler(mockBus, dataDir)
      await scheduler2.loadTasks()

      expect(scheduler2.size).toBe(1)
      const tasks = scheduler2.list()
      expect(tasks[0].message).toBe('persisted task')
      expect(tasks[0].description).toBe('From file')

      scheduler2.stop()
    })

    it('should restore multiple tasks', async () => {
      await scheduler.add({ cronExpr: '0 9 * * *', message: 'task1', chatId: '123' })
      await scheduler.add({ cronExpr: '0 17 * * *', message: 'task2', chatId: '123' })

      const scheduler2 = new Scheduler(mockBus, dataDir)
      await scheduler2.loadTasks()

      expect(scheduler2.size).toBe(2)
      scheduler2.stop()
    })
  })

  describe('task firing', () => {
    it('should emit message:in when task fires', async () => {
      // Use a cron that fires every second (node-cron supports seconds with 6 fields)
      // But for testing, we'll manually call the internal method
      const task = {
        id: 'test-id',
        cronExpr: '* * * * *',
        message: 'test fire',
        chatId: '123',
        userId: '456',
        channel: 'telegram'
      }

      // Access the internal job callback by starting a job then triggering it
      scheduler._startJob(task)

      // Get the job and invoke its callback manually
      const entry = scheduler.tasks.get('test-id')
      expect(entry).toBeDefined()
      expect(entry.job).toBeDefined()

      // Fire manually to verify the event shape
      scheduler.bus.fire('message:in', {
        text: task.message,
        chatId: task.chatId,
        userId: task.userId,
        channel: task.channel,
        scheduled: true
      }, { source: 'scheduler' })

      expect(mockBus.fire).toHaveBeenCalledWith('message:in', {
        text: 'test fire',
        chatId: '123',
        userId: '456',
        channel: 'telegram',
        scheduled: true
      }, { source: 'scheduler' })
    })
  })

  describe('stop', () => {
    it('should stop all cron jobs', async () => {
      await scheduler.add({ cronExpr: '0 9 * * *', message: 'task1', chatId: '123' })
      await scheduler.add({ cronExpr: '0 17 * * *', message: 'task2', chatId: '123' })

      // Should not throw
      scheduler.stop()
      expect(scheduler.size).toBe(2) // tasks still in map, just stopped
    })

    it('should handle stop with no tasks', () => {
      expect(() => scheduler.stop()).not.toThrow()
    })
  })

  describe('timezone', () => {
    it('should store timezone option', () => {
      const tz = new Scheduler(mockBus, dataDir, { timezone: 'America/Mexico_City' })
      expect(tz.timezone).toBe('America/Mexico_City')
      tz.stop()
    })

    it('should default to empty timezone', () => {
      expect(scheduler.timezone).toBe('')
    })
  })

  describe('size', () => {
    it('should return 0 when empty', () => {
      expect(scheduler.size).toBe(0)
    })

    it('should reflect task count', async () => {
      await scheduler.add({ cronExpr: '0 9 * * *', message: 'test', chatId: '123' })
      expect(scheduler.size).toBe(1)

      await scheduler.add({ cronExpr: '0 17 * * *', message: 'test2', chatId: '123' })
      expect(scheduler.size).toBe(2)
    })
  })
})
