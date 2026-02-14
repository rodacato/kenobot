import defaultLogger from '../../logger.js'

/**
 * Consolidator - Converts episodic memories to semantic facts and procedural patterns
 *
 * Process:
 * 1. Load recent episodes (last 24h) from all chats + global
 * 2. Filter salient episodes (errors, successes, novel events)
 * 3. Extract facts → SemanticMemory
 * 4. Extract patterns → ProceduralMemory
 *
 * Phase 4: Simple extraction based on keywords and frequency
 * Phase 6: Use embeddings for semantic clustering
 */
export default class Consolidator {
  constructor(memorySystem, { logger = defaultLogger, salienceThreshold = 0.5 } = {}) {
    this.memory = memorySystem
    this.logger = logger
    this.salienceThreshold = salienceThreshold
  }

  /**
   * Run consolidation on recent episodes.
   *
   * @returns {Promise<{patternsAdded: number, factsAdded: number, episodesProcessed: number}>}
   */
  async run() {
    this.logger.info('consolidator', 'started', {})

    // 1. Load recent episodes
    const episodes = await this._loadRecentEpisodes()

    if (episodes.length === 0) {
      const result = { episodesProcessed: 0, patternsAdded: 0, factsAdded: 0 }
      this.logger.info('consolidator', 'completed', result)
      return result
    }

    // 2. Filter salient episodes
    const salient = episodes.filter(ep => this.scoreSalience(ep) >= this.salienceThreshold)

    // 3. Extract facts from salient episodes, deduplicate against MEMORY.md
    const facts = this.extractFacts(salient)
    const existingMemory = (await this.memory.getLongTermMemory()).toLowerCase()
    const newFacts = facts.filter(f => !existingMemory.includes(f.toLowerCase()))

    if (newFacts.length > 0) {
      await this._appendToLongTerm(newFacts)
    }

    // 4. Extract patterns from error+resolution episodes
    const patterns = this.extractPatterns(salient)
    for (const pattern of patterns) {
      await this.memory.procedural.add(pattern)
    }

    const result = {
      episodesProcessed: episodes.length,
      patternsAdded: patterns.length,
      factsAdded: newFacts.length
    }

    this.logger.info('consolidator', 'completed', result)
    return result
  }

  /**
   * Append new facts to MEMORY.md (long-term semantic memory).
   * Reads existing content, appends facts as bullet points under a dated section.
   * @private
   */
  async _appendToLongTerm(facts) {
    const existing = await this.memory.getLongTermMemory()
    const date = new Date().toISOString().slice(0, 10)
    const section = `\n## Consolidated — ${date}\n${facts.map(f => `- ${f}`).join('\n')}\n`
    await this.memory.writeLongTermMemory(existing.trimEnd() + '\n' + section)
    this.logger.info('consolidator', 'facts_written_to_long_term', { count: facts.length, date })
  }

  /**
   * Load recent episodes from all sources.
   * @private
   * @returns {Promise<string[]>} Individual episode entries
   */
  async _loadRecentEpisodes() {
    const entries = []

    // Load global daily logs (last 1 day)
    const globalRecent = await this.memory.getRecentDays(1)
    if (globalRecent) {
      entries.push(...this._parseEntries(globalRecent))
    }

    // Load per-chat episodes (last 1 day)
    if (this.memory.store?.listChatSessions) {
      const sessions = await this.memory.store.listChatSessions()
      for (const sessionId of sessions) {
        const chatRecent = await this.memory.getChatRecentDays(sessionId, 1)
        if (chatRecent) {
          entries.push(...this._parseEntries(chatRecent))
        }
      }
    }

    return entries
  }

  /**
   * Parse markdown-formatted episode text into individual entries.
   * Entries are separated by "## HH:MM —" headers.
   * @private
   */
  _parseEntries(text) {
    if (!text) return []
    return text.split(/(?=## \d{2}:\d{2} —)/)
      .map(e => e.trim())
      .filter(e => e.length > 0)
  }

  /**
   * Determine if an episode is salient (worth consolidating).
   *
   * @param {string} episode - Episode text
   * @returns {number} Salience score (0.0 - 1.0)
   */
  scoreSalience(episode) {
    const lowerEpisode = episode.toLowerCase()

    let score = 0.0

    // Error indicators (+0.4)
    if (lowerEpisode.includes('error') || lowerEpisode.includes('fail')) {
      score += 0.4
    }

    // Success indicators (+0.3)
    if (lowerEpisode.includes('success') || lowerEpisode.includes('solved')) {
      score += 0.3
    }

    // User correction (+0.5)
    if (lowerEpisode.includes('actually') || lowerEpisode.includes('correction')) {
      score += 0.5
    }

    // Novel situations (+0.3)
    if (lowerEpisode.includes('new') || lowerEpisode.includes('first time')) {
      score += 0.3
    }

    // User preferences and knowledge (+0.6) — these come from <memory> tags,
    // the LLM already decided they were worth remembering
    if (lowerEpisode.includes('favorite') || lowerEpisode.includes('prefer') ||
        lowerEpisode.includes('likes') || lowerEpisode.includes('language') ||
        lowerEpisode.includes('lives in') || lowerEpisode.includes('works at') ||
        lowerEpisode.includes('timezone') || lowerEpisode.includes('name is')) {
      score += 0.6
    }

    // Decisions and lessons (+0.4)
    if (lowerEpisode.includes('decided') || lowerEpisode.includes('learned') ||
        lowerEpisode.includes('remember') || lowerEpisode.includes('important')) {
      score += 0.4
    }

    return Math.min(score, 1.0)
  }

  /**
   * Extract semantic facts from salient episodes.
   * Looks for declarative statements about preferences, states, and knowledge.
   *
   * @param {Array<string>} episodes - Salient episodes
   * @returns {Array<string>} Extracted facts
   */
  extractFacts(episodes) {
    const facts = []
    const factIndicators = [
      'prefers', 'prefer', 'likes', 'always', 'never', 'wants', 'uses', 'needs',
      'favorite', 'favourite', 'lives in', 'works at', 'name is', 'timezone',
      'decided', 'learned', 'language'
    ]

    for (const episode of episodes) {
      const lines = episode.split('\n').map(l => l.trim()).filter(l => l.length > 0)

      for (const line of lines) {
        // Skip section headers (### date) but not timestamp entries (## HH:MM —)
        if (line.startsWith('#') && !/^## \d{2}:\d{2} —/.test(line)) continue

        const cleaned = line.replace(/^## \d{2}:\d{2} — /, '').trim()
        const lower = cleaned.toLowerCase()
        const hasFact = factIndicators.some(indicator => lower.includes(indicator))

        if (hasFact && cleaned.length > 10) {
          facts.push(cleaned)
        }
      }
    }

    return facts
  }

  /**
   * Extract procedural patterns from episodes containing error+resolution pairs.
   *
   * @param {Array<string>} episodes - Salient episodes
   * @returns {Array<Object>} Extracted patterns
   */
  extractPatterns(episodes) {
    const patterns = []

    for (const episode of episodes) {
      const lower = episode.toLowerCase()

      // Look for error + resolution pattern
      const hasError = lower.includes('error') || lower.includes('fail')
      const hasResolution = lower.includes('solved') || lower.includes('fixed') ||
        lower.includes('solution') || lower.includes('resolved')

      if (hasError && hasResolution) {
        const lines = episode.split('\n').map(l => l.trim()).filter(l =>
          l.length > 0 && (!l.startsWith('#') || /^## \d{2}:\d{2} —/.test(l))
        )

        const errorLines = lines.filter(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('fail'))
        const resolutionLines = lines.filter(l =>
          l.toLowerCase().includes('solved') || l.toLowerCase().includes('fixed') ||
          l.toLowerCase().includes('solution') || l.toLowerCase().includes('resolved')
        )

        if (errorLines.length > 0 && resolutionLines.length > 0) {
          patterns.push({
            id: `pattern-${Date.now()}-${patterns.length}`,
            trigger: errorLines[0].replace(/^## \d{2}:\d{2} — /, '').slice(0, 100),
            response: resolutionLines[0].replace(/^## \d{2}:\d{2} — /, '').slice(0, 200),
            confidence: 0.6,
            learnedFrom: 'consolidation'
          })
        }
      }
    }

    return patterns
  }

  /**
   * Extract a single pattern from a cluster of similar episodes.
   * @deprecated Use extractPatterns() instead
   *
   * @param {Array<string>} episodes - Cluster of similar episodes
   * @returns {Object|null} Extracted pattern or null
   */
  extractPattern(episodes) {
    const patterns = this.extractPatterns(episodes)
    return patterns.length > 0 ? patterns[0] : null
  }
}
