import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import EmbeddingStore from './embedding-store.js'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * SQLite-backed embedding store using better-sqlite3.
 *
 * Storage: {memoryDir}/embeddings.db
 * Vectors stored as Float32Array BLOBs for compact storage.
 * Dynamic import so the app works without better-sqlite3 installed.
 */
export default class EmbeddingStoreSqlite extends EmbeddingStore {
  constructor(memoryDir, { logger = defaultLogger } = {}) {
    super()
    this.dbPath = join(memoryDir, 'embeddings.db')
    this.memoryDir = memoryDir
    this.logger = logger
    this.db = null
    this._initPromise = null
  }

  async add(entry) {
    const db = await this._getDb()
    const { id, text, vector, type, sessionId, model, dimensions, createdAt } = entry
    const vectorBlob = vector ? Buffer.from(new Float32Array(vector).buffer) : null

    db.prepare(`
      INSERT OR REPLACE INTO embeddings (id, text, vector, type, session_id, model, dimensions, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, text, vectorBlob, type, sessionId || null, model || null, dimensions || null, createdAt || Date.now())

    this.logger.debug('embedding-store-sqlite', 'entry_added', { id, type })
  }

  async remove(id) {
    const db = await this._getDb()
    db.prepare('DELETE FROM embeddings WHERE id = ?').run(id)
    this.logger.debug('embedding-store-sqlite', 'entry_removed', { id })
  }

  async search(queryVector, topK = 5, filter = {}) {
    const db = await this._getDb()
    const entries = this._queryEntries(db, filter)
    return this._searchInMemory(entries, queryVector, topK, filter)
  }

  async getAll(filter = {}) {
    const db = await this._getDb()
    return this._queryEntries(db, filter)
  }

  async compact() {
    const db = await this._getDb()
    db.exec('VACUUM')
    this.logger.debug('embedding-store-sqlite', 'compacted')
  }

  async healthCheck() {
    try {
      const db = await this._getDb()
      const result = db.pragma('integrity_check')
      const ok = result[0]?.integrity_check === 'ok'
      return { status: ok ? 'ok' : 'error', detail: ok ? undefined : 'integrity check failed' }
    } catch (error) {
      return { status: 'error', detail: error.message }
    }
  }

  async close() {
    if (this.db) {
      this.db.close()
      this.db = null
      this._initPromise = null
    }
  }

  // --- Private helpers ---

  _queryEntries(db, filter) {
    let sql = 'SELECT id, text, vector, type, session_id, model, dimensions, created_at FROM embeddings WHERE 1=1'
    const params = []

    if (filter.type) {
      sql += ' AND type = ?'
      params.push(filter.type)
    }
    if (filter.sessionId) {
      sql += ' AND session_id = ?'
      params.push(filter.sessionId)
    }
    if (filter.dateRange) {
      sql += ' AND created_at >= ? AND created_at <= ?'
      params.push(filter.dateRange.start, filter.dateRange.end)
    }

    const rows = db.prepare(sql).all(...params)
    return rows.map(row => ({
      id: row.id,
      text: row.text,
      vector: row.vector ? Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4)) : null,
      type: row.type,
      sessionId: row.session_id,
      model: row.model,
      dimensions: row.dimensions,
      createdAt: row.created_at
    }))
  }

  async _getDb() {
    if (this.db) return this.db
    if (!this._initPromise) {
      this._initPromise = this._initDb()
    }
    return this._initPromise
  }

  async _initDb() {
    await mkdir(this.memoryDir, { recursive: true })

    let Database
    try {
      Database = (await import('better-sqlite3')).default
    } catch {
      throw new Error('better-sqlite3 is required for SQLite embedding store. Install with: npm install better-sqlite3')
    }

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        vector BLOB,
        type TEXT NOT NULL,
        session_id TEXT,
        model TEXT,
        dimensions INTEGER,
        created_at INTEGER NOT NULL
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_embeddings_type ON embeddings(type)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_embeddings_session ON embeddings(session_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_embeddings_created ON embeddings(created_at)')

    this.logger.info('embedding-store-sqlite', 'initialized', { path: this.dbPath })
    return this.db
  }
}
