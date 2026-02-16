import { readFile, appendFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import EmbeddingStore from './embedding-store.js'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * JSONL-backed embedding store.
 *
 * Storage layout: {memoryDir}/embeddings/{type}.jsonl
 * Each line is a JSON object with { id, text, vector, type, sessionId, model, dimensions, createdAt }.
 * Entries loaded lazily into an in-memory Map on first access per type.
 */
export default class EmbeddingStoreJsonl extends EmbeddingStore {
  constructor(memoryDir, { logger = defaultLogger } = {}) {
    super()
    this.embeddingsDir = join(memoryDir, 'embeddings')
    this.logger = logger
    /** @type {Map<string, Map<string, object>>} type → (id → entry) */
    this._cache = new Map()
    this._dirReady = false
  }

  async add(entry) {
    await this._ensureDir()
    const { id, type } = entry
    const enriched = { ...entry, createdAt: entry.createdAt || Date.now() }

    const filepath = this._filepath(type)
    await appendFile(filepath, JSON.stringify(enriched) + '\n', 'utf8')

    const typeCache = await this._ensureLoaded(type)
    typeCache.set(id, enriched)

    this.logger.debug('embedding-store-jsonl', 'entry_added', { id, type })
  }

  async remove(id) {
    for (const [type, typeCache] of this._cache) {
      if (typeCache.has(id)) {
        typeCache.delete(id)
        await this._rewrite(type)
        this.logger.debug('embedding-store-jsonl', 'entry_removed', { id, type })
        return
      }
    }
  }

  async search(queryVector, topK = 5, filter = {}) {
    const entries = await this._allEntries(filter)
    return this._searchInMemory(entries, queryVector, topK, filter)
  }

  async getAll(filter = {}) {
    const entries = await this._allEntries(filter)
    return entries
  }

  async compact() {
    for (const type of this._cache.keys()) {
      await this._rewrite(type)
    }
    this.logger.debug('embedding-store-jsonl', 'compacted', {
      types: [...this._cache.keys()]
    })
  }

  async healthCheck() {
    try {
      await this._ensureDir()
      return { status: 'ok' }
    } catch (error) {
      return { status: 'error', detail: error.message }
    }
  }

  async close() {
    this._cache.clear()
  }

  // --- Private helpers ---

  async _allEntries(filter) {
    const types = filter.type ? [filter.type] : await this._loadedTypes()
    const all = []
    for (const type of types) {
      const typeCache = await this._ensureLoaded(type)
      all.push(...typeCache.values())
    }
    return all
  }

  async _loadedTypes() {
    // If we have cached types, use them. Otherwise scan directory.
    if (this._cache.size > 0) return [...this._cache.keys()]

    try {
      const { readdir } = await import('node:fs/promises')
      const files = await readdir(this.embeddingsDir)
      return files
        .filter(f => f.endsWith('.jsonl'))
        .map(f => f.replace('.jsonl', ''))
    } catch {
      return []
    }
  }

  async _ensureLoaded(type) {
    if (this._cache.has(type)) return this._cache.get(type)

    const typeCache = new Map()
    this._cache.set(type, typeCache)

    const filepath = this._filepath(type)
    let content
    try {
      content = await readFile(filepath, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return typeCache
      throw err
    }

    const lines = content.split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        typeCache.set(entry.id, entry)
      } catch {
        this.logger.warn('embedding-store-jsonl', 'corrupt_line', {
          type, line: line.slice(0, 100)
        })
      }
    }

    this.logger.debug('embedding-store-jsonl', 'loaded', {
      type, count: typeCache.size
    })
    return typeCache
  }

  async _rewrite(type) {
    const typeCache = this._cache.get(type)
    if (!typeCache) return

    await this._ensureDir()
    const filepath = this._filepath(type)
    const tmpPath = filepath + '.new'
    const data = [...typeCache.values()].map(e => JSON.stringify(e) + '\n').join('')

    await writeFile(tmpPath, data, 'utf8')
    await rename(tmpPath, filepath)
  }

  _filepath(type) {
    return join(this.embeddingsDir, `${type}.jsonl`)
  }

  async _ensureDir() {
    if (this._dirReady) return
    await mkdir(this.embeddingsDir, { recursive: true })
    this._dirReady = true
  }
}
