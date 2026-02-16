import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import TaskStore from '../../../src/adapters/storage/task-store.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('TaskStore', () => {
  let tempDir
  let store

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'taskstore-test-'))
    store = new TaskStore(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('appendEvent', () => {
    it('creates directory and file, appends JSON line with ts field', async () => {
      const event = { type: 'created', data: { foo: 'bar' } }

      await store.appendEvent('task-123', event)

      const events = await store.loadEvents('task-123')
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject(event)
      expect(events[0]).toHaveProperty('ts')
      expect(typeof events[0].ts).toBe('number')
    })

    it('appends multiple events to same file', async () => {
      const event1 = { type: 'created', data: { step: 1 } }
      const event2 = { type: 'updated', data: { step: 2 } }
      const event3 = { type: 'completed', data: { step: 3 } }

      await store.appendEvent('task-456', event1)
      await store.appendEvent('task-456', event2)
      await store.appendEvent('task-456', event3)

      const events = await store.loadEvents('task-456')
      expect(events).toHaveLength(3)
      expect(events[0]).toMatchObject(event1)
      expect(events[1]).toMatchObject(event2)
      expect(events[2]).toMatchObject(event3)
    })
  })

  describe('loadEvents', () => {
    it('returns array of parsed events', async () => {
      const event = { type: 'started', payload: { userId: 123 } }

      await store.appendEvent('task-789', event)

      const events = await store.loadEvents('task-789')
      expect(Array.isArray(events)).toBe(true)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('started')
      expect(events[0].payload).toEqual({ userId: 123 })
    })

    it('returns empty array for nonexistent task', async () => {
      const events = await store.loadEvents('nonexistent-task')

      expect(events).toEqual([])
    })

    it('returns multiple events in order', async () => {
      const events = [
        { type: 'created', seq: 1 },
        { type: 'progress', seq: 2 },
        { type: 'progress', seq: 3 },
        { type: 'completed', seq: 4 }
      ]

      for (const event of events) {
        await store.appendEvent('task-ordered', event)
      }

      const loaded = await store.loadEvents('task-ordered')
      expect(loaded).toHaveLength(4)
      expect(loaded[0].seq).toBe(1)
      expect(loaded[1].seq).toBe(2)
      expect(loaded[2].seq).toBe(3)
      expect(loaded[3].seq).toBe(4)
    })
  })
})
