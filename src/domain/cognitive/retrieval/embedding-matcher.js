import defaultLogger from '../../../infrastructure/logger.js'

/**
 * EmbeddingMatcher - Embedding-based semantic search for memory retrieval.
 *
 * Receives embedding provider and store via DI (no adapter imports).
 * Provides search and Reciprocal Rank Fusion (RRF) merge with keyword results.
 */
export default class EmbeddingMatcher {
  constructor({ embeddingProvider, embeddingStore, logger = defaultLogger } = {}) {
    this.embeddingProvider = embeddingProvider
    this.embeddingStore = embeddingStore
    this.logger = logger
  }

  /**
   * Search embeddings by query text.
   *
   * @param {string} queryText - User query to embed and search
   * @param {string} type - Memory type ('semantic' or 'episodic')
   * @param {number} topK - Number of results
   * @param {object} [filter] - Optional filter (sessionId, dateRange)
   * @returns {Promise<Array<{ id: string, text: string, score: number, metadata: object }>>}
   */
  async search(queryText, type, topK = 5, filter = {}) {
    const startTime = Date.now()

    const vectors = await this.embeddingProvider.embed([queryText], 'RETRIEVAL_QUERY')
    if (!vectors) {
      this.logger.debug('embedding-matcher', 'provider_returned_null', { queryText: queryText.slice(0, 80) })
      return []
    }

    const results = await this.embeddingStore.search(vectors[0], topK, { ...filter, type })

    this.logger.info('embedding-matcher', 'search_complete', {
      type,
      topK,
      resultCount: results.length,
      durationMs: Date.now() - startTime
    })

    return results
  }

  /**
   * Merge keyword and embedding results using Reciprocal Rank Fusion.
   *
   * RRF score: score(item) = Σ 1/(k + rank_in_list)
   * where k=60 is a constant that prevents high-ranked items from dominating.
   *
   * @param {Array<{ content: string }>} keywordResults - Keyword search results
   * @param {Array<{ text: string, id?: string }>} embeddingResults - Embedding search results
   * @param {number} [k=60] - RRF constant
   * @returns {Array<{ content: string, rrfScore: number, sources: string[] }>}
   */
  static mergeWithRRF(keywordResults, embeddingResults, k = 60) {
    const scores = new Map()

    // Score keyword results by rank
    for (let i = 0; i < keywordResults.length; i++) {
      const key = keywordResults[i].content
      if (!scores.has(key)) {
        scores.set(key, { content: key, rrfScore: 0, sources: [], original: keywordResults[i] })
      }
      const entry = scores.get(key)
      entry.rrfScore += 1 / (k + i + 1)
      if (!entry.sources.includes('keyword')) entry.sources.push('keyword')
    }

    // Score embedding results by rank
    for (let i = 0; i < embeddingResults.length; i++) {
      const key = embeddingResults[i].text
      if (!scores.has(key)) {
        scores.set(key, { content: key, rrfScore: 0, sources: [], original: embeddingResults[i] })
      }
      const entry = scores.get(key)
      entry.rrfScore += 1 / (k + i + 1)
      if (!entry.sources.includes('embedding')) entry.sources.push('embedding')
    }

    // Sort by RRF score descending
    return [...scores.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map(({ content, rrfScore, sources, original }) => ({
        content,
        rrfScore,
        sources,
        score: original.score,
        matchedKeywords: original.matchedKeywords,
        metadata: original.metadata
      }))
  }
}
