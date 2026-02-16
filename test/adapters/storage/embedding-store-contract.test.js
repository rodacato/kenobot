import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import EmbeddingStoreJsonl from '../../../src/adapters/storage/embedding-store-jsonl.js'
import EmbeddingStoreSqlite from '../../../src/adapters/storage/embedding-store-sqlite.js'
import { FOOD_PREF, FOOD_QUERY, WEATHER_OBS, TECH_ERROR } from '../../fixtures/embedding-vectors.js'

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

/**
 * Contract tests: both backends must produce identical behavior.
 */
const backends = [
  ['jsonl', (dir) => new EmbeddingStoreJsonl(dir, { logger: mockLogger })],
  ['sqlite', (dir) => new EmbeddingStoreSqlite(dir, { logger: mockLogger })]
]

describe.each(backends)('EmbeddingStore contract [%s]', (name, factory) => {
  let tmpDir, store

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), `embed-contract-${name}-`))
    store = factory(tmpDir)
  })

  afterEach(async () => {
    await store.close()
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should add and retrieve entries', async () => {
    await store.add({ id: 'c1', text: 'food item', vector: FOOD_PREF, type: 'semantic' })
    const all = await store.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('c1')
    expect(all[0].text).toBe('food item')
  })

  it('should search by cosine similarity', async () => {
    await store.add({ id: 'c-food', text: 'pizza', vector: FOOD_PREF, type: 'semantic' })
    await store.add({ id: 'c-weather', text: 'rain', vector: WEATHER_OBS, type: 'semantic' })
    await store.add({ id: 'c-tech', text: 'error', vector: TECH_ERROR, type: 'semantic' })

    const results = await store.search(FOOD_QUERY, 3)
    expect(results).toHaveLength(3)
    expect(results[0].id).toBe('c-food')
    expect(results[0].score).toBeGreaterThan(0.9)
  })

  it('should produce identical ranking for same data', async () => {
    await store.add({ id: 'r1', text: 'food', vector: FOOD_PREF, type: 'semantic' })
    await store.add({ id: 'r2', text: 'weather', vector: WEATHER_OBS, type: 'semantic' })
    await store.add({ id: 'r3', text: 'tech', vector: TECH_ERROR, type: 'semantic' })

    const results = await store.search(FOOD_QUERY, 3)
    // r1 (food) > r3 (tech, slight overlap in dim 4) > r2 (weather, orthogonal)
    expect(results.map(r => r.id)).toEqual(['r1', 'r3', 'r2'])
  })

  it('should remove entries', async () => {
    await store.add({ id: 'del1', text: 'gone', vector: FOOD_PREF, type: 'semantic' })
    await store.add({ id: 'del2', text: 'stays', vector: WEATHER_OBS, type: 'semantic' })

    await store.remove('del1')
    const all = await store.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('del2')
  })

  it('should filter by type', async () => {
    await store.add({ id: 'f1', text: 'semantic', vector: FOOD_PREF, type: 'semantic' })
    await store.add({ id: 'f2', text: 'episodic', vector: WEATHER_OBS, type: 'episodic' })

    const results = await store.search(FOOD_QUERY, 5, { type: 'semantic' })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('f1')
  })

  it('should filter by sessionId', async () => {
    await store.add({ id: 'fs1', text: 'A', vector: FOOD_PREF, type: 'episodic', sessionId: 'chatA' })
    await store.add({ id: 'fs2', text: 'B', vector: FOOD_PREF, type: 'episodic', sessionId: 'chatB' })

    const results = await store.search(FOOD_QUERY, 5, { sessionId: 'chatA' })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('fs1')
  })

  it('should filter by dateRange', async () => {
    const now = Date.now()
    await store.add({ id: 'dr1', text: 'old', vector: FOOD_PREF, type: 'semantic', createdAt: now - 100000 })
    await store.add({ id: 'dr2', text: 'new', vector: FOOD_PREF, type: 'semantic', createdAt: now })

    const results = await store.search(FOOD_QUERY, 5, {
      dateRange: { start: now - 1000, end: now + 1000 }
    })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('dr2')
  })

  it('should compact without losing data', async () => {
    await store.add({ id: 'comp1', text: 'kept', vector: FOOD_PREF, type: 'semantic' })
    await store.compact()
    const all = await store.getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('comp1')
  })

  it('should return healthy status', async () => {
    const result = await store.healthCheck()
    expect(result.status).toBe('ok')
  })
})
