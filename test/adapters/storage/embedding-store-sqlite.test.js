import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddingStoreSqlite from '../../../src/adapters/storage/embedding-store-sqlite.js'
import { FOOD_PREF, FOOD_QUERY, WEATHER_OBS, randomVector } from '../../fixtures/embedding-vectors.js'

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('EmbeddingStoreSqlite', () => {
  let tmpDir, store

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'embed-sqlite-'))
    store = new EmbeddingStoreSqlite(join(tmpDir, 'memory'), { logger: mockLogger })
  })

  afterEach(async () => {
    await store.close()
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('schema creation', () => {
    it('should create database and table on first access', async () => {
      await store.add({ id: 'schema1', text: 'test', vector: FOOD_PREF, type: 'semantic' })
      const db = await store._getDb()
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      expect(tables.map(t => t.name)).toContain('embeddings')
    })

    it('should enable WAL mode', async () => {
      const db = await store._getDb()
      const result = db.pragma('journal_mode')
      expect(result[0].journal_mode).toBe('wal')
    })

    it('should create indexes', async () => {
      const db = await store._getDb()
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='embeddings'").all()
      const names = indexes.map(i => i.name)
      expect(names).toContain('idx_embeddings_type')
      expect(names).toContain('idx_embeddings_session')
      expect(names).toContain('idx_embeddings_created')
    })
  })

  describe('BLOB round-trip', () => {
    it('should store and retrieve Float32Array vectors accurately', async () => {
      await store.add({ id: 'blob1', text: 'test', vector: FOOD_PREF, type: 'semantic' })

      const entries = await store.getAll()
      expect(entries).toHaveLength(1)
      expect(entries[0].vector).toHaveLength(FOOD_PREF.length)
      for (let i = 0; i < FOOD_PREF.length; i++) {
        expect(entries[0].vector[i]).toBeCloseTo(FOOD_PREF[i], 5)
      }
    })
  })

  describe('add + search round-trip', () => {
    it('should store and retrieve similar entries', async () => {
      await store.add({ id: 'food1', text: 'I like pizza', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'weather1', text: 'It is raining', vector: WEATHER_OBS, type: 'semantic' })

      const results = await store.search(FOOD_QUERY, 2)
      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('food1')
      expect(results[0].score).toBeGreaterThan(0.9)
    })
  })

  describe('remove', () => {
    it('should remove entry by id', async () => {
      await store.add({ id: 'r1', text: 'remove me', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'r2', text: 'keep me', vector: WEATHER_OBS, type: 'semantic' })

      await store.remove('r1')

      const all = await store.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe('r2')
    })
  })

  describe('filter options', () => {
    it('should filter by sessionId', async () => {
      await store.add({ id: 's1', text: 'chat A', vector: FOOD_PREF, type: 'episodic', sessionId: 'chatA' })
      await store.add({ id: 's2', text: 'chat B', vector: FOOD_PREF, type: 'episodic', sessionId: 'chatB' })

      const results = await store.search(FOOD_QUERY, 5, { sessionId: 'chatA' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('s1')
    })

    it('should filter by dateRange', async () => {
      const now = Date.now()
      await store.add({ id: 'd1', text: 'old', vector: FOOD_PREF, type: 'semantic', createdAt: now - 100000 })
      await store.add({ id: 'd2', text: 'new', vector: FOOD_PREF, type: 'semantic', createdAt: now })

      const results = await store.search(FOOD_QUERY, 5, {
        dateRange: { start: now - 1000, end: now + 1000 }
      })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('d2')
    })

    it('should filter by type', async () => {
      await store.add({ id: 't1', text: 'semantic', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 't2', text: 'episodic', vector: FOOD_PREF, type: 'episodic' })

      const results = await store.search(FOOD_QUERY, 5, { type: 'semantic' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('t1')
    })
  })

  describe('compact', () => {
    it('should vacuum without error', async () => {
      await store.add({ id: 'v1', text: 'test', vector: FOOD_PREF, type: 'semantic' })
      await store.remove('v1')
      await expect(store.compact()).resolves.not.toThrow()
    })
  })

  describe('healthCheck', () => {
    it('should return ok for valid database', async () => {
      await store.add({ id: 'h1', text: 'test', vector: FOOD_PREF, type: 'semantic' })
      const result = await store.healthCheck()
      expect(result.status).toBe('ok')
    })
  })

  describe('INSERT OR REPLACE', () => {
    it('should update existing entry on same id', async () => {
      await store.add({ id: 'dup1', text: 'original', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'dup1', text: 'updated', vector: WEATHER_OBS, type: 'semantic' })

      const all = await store.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].text).toBe('updated')
    })
  })

  describe('performance', () => {
    it('should search 10K vectors in reasonable time', async () => {
      const db = await store._getDb()
      const stmt = db.prepare(`
        INSERT INTO embeddings (id, text, vector, type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)

      const insertMany = db.transaction(() => {
        for (let i = 0; i < 10000; i++) {
          const vec = randomVector(8)
          const blob = Buffer.from(new Float32Array(vec).buffer)
          stmt.run(`perf-${i}`, `entry ${i}`, blob, 'semantic', Date.now())
        }
      })
      insertMany()

      const start = performance.now()
      const results = await store.search(FOOD_QUERY, 10)
      const elapsed = performance.now() - start

      expect(results).toHaveLength(10)
      expect(elapsed).toBeLessThan(200)
    })
  })
})
