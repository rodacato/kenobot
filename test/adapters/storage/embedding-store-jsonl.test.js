import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddingStoreJsonl from '../../../src/adapters/storage/embedding-store-jsonl.js'
import { FOOD_PREF, FOOD_QUERY, WEATHER_OBS, TECH_ERROR, GENERAL, randomVector } from '../../fixtures/embedding-vectors.js'

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('EmbeddingStoreJsonl', () => {
  let tmpDir, store

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'embed-jsonl-'))
    store = new EmbeddingStoreJsonl(tmpDir, { logger: mockLogger })
  })

  afterEach(async () => {
    await store.close()
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('add + search round-trip', () => {
    it('should store and retrieve similar entries', async () => {
      await store.add({ id: 'food1', text: 'I like pizza', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'weather1', text: 'It is raining', vector: WEATHER_OBS, type: 'semantic' })

      const results = await store.search(FOOD_QUERY, 2)

      expect(results).toHaveLength(2)
      expect(results[0].id).toBe('food1')
      expect(results[0].score).toBeGreaterThan(0.9)
      expect(results[0].text).toBe('I like pizza')
    })

    it('should persist to JSONL file', async () => {
      await store.add({ id: 'e1', text: 'test', vector: FOOD_PREF, type: 'semantic' })

      const filepath = join(tmpDir, 'memory', 'embeddings', 'semantic.jsonl')
      const content = await readFile(filepath, 'utf8')
      const parsed = JSON.parse(content.trim())
      expect(parsed.id).toBe('e1')
      expect(parsed.vector).toEqual(FOOD_PREF)
    })
  })

  describe('remove', () => {
    it('should remove entry by id', async () => {
      await store.add({ id: 'r1', text: 'remove me', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'r2', text: 'keep me', vector: WEATHER_OBS, type: 'semantic' })

      await store.remove('r1')

      const results = await store.search(FOOD_QUERY, 5)
      expect(results.every(r => r.id !== 'r1')).toBe(true)
    })
  })

  describe('getAll', () => {
    it('should return all entries', async () => {
      await store.add({ id: 'a1', text: 'one', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'a2', text: 'two', vector: WEATHER_OBS, type: 'episodic' })

      const all = await store.getAll()
      expect(all).toHaveLength(2)
    })

    it('should filter by type', async () => {
      await store.add({ id: 'a1', text: 'one', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'a2', text: 'two', vector: WEATHER_OBS, type: 'episodic' })

      const semantic = await store.getAll({ type: 'semantic' })
      expect(semantic).toHaveLength(1)
      expect(semantic[0].id).toBe('a1')
    })
  })

  describe('filter options', () => {
    it('should filter search by sessionId', async () => {
      await store.add({ id: 's1', text: 'chat A', vector: FOOD_PREF, type: 'episodic', sessionId: 'chatA' })
      await store.add({ id: 's2', text: 'chat B', vector: FOOD_PREF, type: 'episodic', sessionId: 'chatB' })

      const results = await store.search(FOOD_QUERY, 5, { sessionId: 'chatA' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('s1')
    })

    it('should filter search by dateRange', async () => {
      const now = Date.now()
      await store.add({ id: 'd1', text: 'old', vector: FOOD_PREF, type: 'semantic', createdAt: now - 100000 })
      await store.add({ id: 'd2', text: 'new', vector: FOOD_PREF, type: 'semantic', createdAt: now })

      const results = await store.search(FOOD_QUERY, 5, {
        dateRange: { start: now - 1000, end: now + 1000 }
      })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('d2')
    })

    it('should filter search by type', async () => {
      await store.add({ id: 't1', text: 'semantic', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 't2', text: 'episodic', vector: FOOD_PREF, type: 'episodic' })

      const results = await store.search(FOOD_QUERY, 5, { type: 'semantic' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('t1')
    })
  })

  describe('compact', () => {
    it('should rewrite files without deleted entries', async () => {
      await store.add({ id: 'c1', text: 'keep', vector: FOOD_PREF, type: 'semantic' })
      await store.add({ id: 'c2', text: 'delete', vector: WEATHER_OBS, type: 'semantic' })
      await store.remove('c2')
      await store.compact()

      const filepath = join(tmpDir, 'memory', 'embeddings', 'semantic.jsonl')
      const content = await readFile(filepath, 'utf8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(1)
      expect(JSON.parse(lines[0]).id).toBe('c1')
    })
  })

  describe('corrupt JSONL lines', () => {
    it('should skip corrupt lines and log warning', async () => {
      const dir = join(tmpDir, 'memory', 'embeddings')
      await mkdir(dir, { recursive: true })
      const filepath = join(dir, 'semantic.jsonl')

      const goodLine = JSON.stringify({ id: 'good', text: 'ok', vector: FOOD_PREF, type: 'semantic' })
      await writeFile(filepath, `${goodLine}\n{corrupt json\n`, 'utf8')

      const results = await store.search(FOOD_QUERY, 5)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('good')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'embedding-store-jsonl', 'corrupt_line',
        expect.objectContaining({ type: 'semantic' })
      )
    })
  })

  describe('null/missing vectors', () => {
    it('should skip entries with null vectors in search', async () => {
      await store.add({ id: 'n1', text: 'no vec', vector: null, type: 'semantic' })
      await store.add({ id: 'n2', text: 'has vec', vector: FOOD_PREF, type: 'semantic' })

      const results = await store.search(FOOD_QUERY, 5)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('n2')
    })
  })

  describe('healthCheck', () => {
    it('should return ok status', async () => {
      const result = await store.healthCheck()
      expect(result.status).toBe('ok')
    })
  })

  describe('lazy loading', () => {
    it('should load from disk on first access', async () => {
      // Write directly to disk
      const dir = join(tmpDir, 'memory', 'embeddings')
      await mkdir(dir, { recursive: true })
      const entry = { id: 'lazy1', text: 'lazy loaded', vector: FOOD_PREF, type: 'semantic' }
      await writeFile(join(dir, 'semantic.jsonl'), JSON.stringify(entry) + '\n', 'utf8')

      // New store instance should find it
      const store2 = new EmbeddingStoreJsonl(tmpDir, { logger: mockLogger })
      const results = await store2.search(FOOD_QUERY, 5)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('lazy1')
    })
  })

  describe('performance', () => {
    it('should search 10K vectors in reasonable time', async () => {
      // Pre-populate cache directly for speed
      const entries = new Map()
      for (let i = 0; i < 10000; i++) {
        entries.set(`perf-${i}`, {
          id: `perf-${i}`,
          text: `entry ${i}`,
          vector: randomVector(8),
          type: 'semantic'
        })
      }
      store._cache.set('semantic', entries)

      const start = performance.now()
      const results = await store.search(FOOD_QUERY, 10)
      const elapsed = performance.now() - start

      expect(results).toHaveLength(10)
      expect(elapsed).toBeLessThan(100)
    })
  })
})
