import defaultLogger from '../../logger.js'

/**
 * MemoryPruner - Cleans up stale and redundant memory
 *
 * Pruning strategies:
 * 1. Working memory: Delete stale sessions (>7 days)
 * 2. Procedural memory: Remove low-confidence patterns (unused)
 *
 * Phase 4: Basic staleness pruning
 * Phase 6: Semantic deduplication with embeddings
 */
export default class MemoryPruner {
  constructor(memorySystem, { logger = defaultLogger, staleThreshold = 7, archiveThreshold = 30 } = {}) {
    this.memory = memorySystem
    this.logger = logger
    this.staleThreshold = staleThreshold // days
    this.archiveThreshold = archiveThreshold // days
  }

  /**
   * Run memory pruning.
   *
   * @returns {Promise<{workingPruned: number, episodesCompressed: number, patternsPruned: number}>}
   */
  async run() {
    this.logger.info('memory-pruner', 'started', {})

    const workingPruned = await this.pruneWorkingMemory()
    const patternsPruned = await this.prunePatterns()
    const episodesCompressed = await this.compressEpisodes()

    const result = { workingPruned, episodesCompressed, patternsPruned }
    this.logger.info('memory-pruner', 'completed', result)
    return result
  }

  /**
   * Delete stale working memory sessions.
   *
   * @returns {Promise<number>} Number of sessions deleted
   */
  async pruneWorkingMemory() {
    if (!this.memory.store?.listWorkingMemorySessions) return 0

    const sessions = await this.memory.store.listWorkingMemorySessions()
    const now = Date.now()
    const thresholdMs = this.staleThreshold * 24 * 60 * 60 * 1000
    let pruned = 0

    for (const { sessionId, updatedAt } of sessions) {
      if (now - updatedAt > thresholdMs) {
        try {
          await this.memory.store.deleteWorkingMemory(sessionId)
          pruned++
          this.logger.info('memory-pruner', 'working_memory_pruned', { sessionId })
        } catch (error) {
          this.logger.warn('memory-pruner', 'prune_failed', { sessionId, error: error.message })
        }
      }
    }

    return pruned
  }

  /**
   * Compress old episodic memories.
   * Phase 6: Will merge old daily logs into summaries.
   *
   * @returns {Promise<number>} Number of episodes compressed
   */
  async compressEpisodes() {
    // Phase 6: Implement daily log compression for episodes older than archiveThreshold
    return 0
  }

  /**
   * Remove low-confidence or unused procedural patterns.
   *
   * @returns {Promise<number>} Number of patterns removed
   */
  async prunePatterns() {
    const patterns = await this.memory.getPatterns()
    let pruned = 0

    for (const pattern of patterns) {
      if (pattern.confidence < 0.3 && (pattern.usageCount || 0) === 0) {
        await this.memory.procedural.remove(pattern.id)
        pruned++
        this.logger.info('memory-pruner', 'pattern_pruned', {
          id: pattern.id,
          confidence: pattern.confidence,
          usageCount: pattern.usageCount
        })
      }
    }

    return pruned
  }

  /**
   * Detect similar/redundant episodes for merging.
   * Uses Jaccard similarity on word sets.
   *
   * @param {Array<string>} episodes - Episodes to analyze
   * @returns {Array<Array<number>>} Groups of similar episode indices
   */
  findSimilarEpisodes(episodes) {
    if (!episodes || episodes.length < 2) return []

    const wordSets = episodes.map(ep =>
      new Set(ep.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    )

    const threshold = 0.7
    const visited = new Set()
    const groups = []

    for (let i = 0; i < wordSets.length; i++) {
      if (visited.has(i)) continue

      const group = [i]
      visited.add(i)

      for (let j = i + 1; j < wordSets.length; j++) {
        if (visited.has(j)) continue

        const similarity = this._jaccardSimilarity(wordSets[i], wordSets[j])
        if (similarity >= threshold) {
          group.push(j)
          visited.add(j)
        }
      }

      if (group.length > 1) {
        groups.push(group)
      }
    }

    return groups
  }

  /**
   * Compute Jaccard similarity between two word sets.
   * @private
   */
  _jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1
    if (setA.size === 0 || setB.size === 0) return 0

    let intersection = 0
    for (const word of setA) {
      if (setB.has(word)) intersection++
    }

    const union = setA.size + setB.size - intersection
    return intersection / union
  }

  /**
   * Merge similar episodes into one consolidated episode.
   *
   * @param {Array<string>} episodes - Episodes to merge
   * @returns {string} Merged episode
   */
  mergeEpisodes(episodes) {
    return episodes.join('\n\n')
  }
}
