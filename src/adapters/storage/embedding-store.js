import { cosineSimilarity } from '../../infrastructure/cosine-similarity.js'

/**
 * EmbeddingStore - Abstract base for embedding vector persistence.
 *
 * Subclasses must implement the storage-specific methods.
 * Shared cosine similarity search logic lives here.
 */
export default class EmbeddingStore {
  /**
   * Store an embedding entry.
   * @param {{ id: string, text: string, vector: number[], type: string, sessionId?: string, model?: string, dimensions?: number, createdAt?: number }} entry
   */
  async add(entry) {
    throw new Error('add() must be implemented by subclass')
  }

  /**
   * Remove an embedding by ID.
   * @param {string} id
   */
  async remove(id) {
    throw new Error('remove() must be implemented by subclass')
  }

  /**
   * Search for similar embeddings.
   * @param {number[]} queryVector
   * @param {number} topK
   * @param {{ type?: string, sessionId?: string, dateRange?: { start: number, end: number } }} [filter]
   * @returns {Promise<Array<{ id: string, text: string, score: number, metadata: object }>>}
   */
  async search(queryVector, topK = 5, filter = {}) {
    throw new Error('search() must be implemented by subclass')
  }

  /**
   * Get all entries matching a filter.
   * @param {{ type?: string, sessionId?: string }} [filter]
   * @returns {Promise<Array<object>>}
   */
  async getAll(filter = {}) {
    throw new Error('getAll() must be implemented by subclass')
  }

  /**
   * Compact/optimize storage.
   */
  async compact() {
    throw new Error('compact() must be implemented by subclass')
  }

  /**
   * Health check.
   * @returns {Promise<{ status: string, detail?: string }>}
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass')
  }

  /**
   * Release resources.
   */
  async close() {
    // Default: no-op
  }

  /**
   * Brute-force cosine similarity search over in-memory entries.
   * Shared by both JSONL and SQLite backends.
   *
   * @param {Map|Array} entries - Entries with { id, text, vector, type, sessionId, createdAt }
   * @param {number[]} queryVector
   * @param {number} topK
   * @param {object} filter
   * @returns {Array<{ id: string, text: string, score: number, metadata: object }>}
   */
  _searchInMemory(entries, queryVector, topK, filter = {}) {
    const items = entries instanceof Map ? [...entries.values()] : entries
    const scored = []

    for (const entry of items) {
      if (!entry.vector) continue
      if (filter.type && entry.type !== filter.type) continue
      if (filter.sessionId && entry.sessionId !== filter.sessionId) continue
      if (filter.dateRange) {
        const ts = entry.createdAt || 0
        if (ts < filter.dateRange.start || ts > filter.dateRange.end) continue
      }

      try {
        const score = cosineSimilarity(queryVector, entry.vector)
        scored.push({
          id: entry.id,
          text: entry.text,
          score,
          metadata: {
            type: entry.type,
            sessionId: entry.sessionId,
            model: entry.model,
            dimensions: entry.dimensions,
            createdAt: entry.createdAt
          }
        })
      } catch {
        // Dimension mismatch or zero vector — skip
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }
}
