import defaultLogger from '../../logger.js'

/**
 * Consolidator - Converts episodic memories to semantic facts and procedural patterns
 *
 * Process:
 * 1. Load recent episodes (last 24h) from all chats + global
 * 2. Extract facts → SemanticMemory (all episodes trusted — LLM curated via <memory> tags)
 * 3. Extract patterns → ProceduralMemory
 */
export default class Consolidator {
  constructor(memorySystem, { logger = defaultLogger } = {}) {
    this.memory = memorySystem
    this.logger = logger
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

    // 2. All episodes are trusted (LLM already curated via <memory> tags)
    const salient = episodes

    // 3. Extract facts, deduplicate against MEMORY.md
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
   * Score episode salience. Returns 1.0 for all episodes — the LLM already
   * decided they were worth remembering when it wrapped them in <memory> tags.
   *
   * @param {string} _episode - Episode text (unused)
   * @returns {number} Always 1.0
   */
  scoreSalience(_episode) {
    return 1.0
  }

  /**
   * Extract semantic facts from episodes.
   * All episode content is extracted — the LLM already curated what's important
   * via <memory> tags, so no keyword filtering is needed.
   *
   * @param {Array<string>} episodes - Episodes to extract from
   * @returns {Array<string>} Extracted facts
   */
  extractFacts(episodes) {
    const facts = []

    for (const episode of episodes) {
      const lines = episode.split('\n').map(l => l.trim()).filter(l => l.length > 0)

      for (const line of lines) {
        // Skip section headers (### date) but not timestamp entries (## HH:MM —)
        if (line.startsWith('#') && !/^## \d{2}:\d{2} —/.test(line)) continue

        const cleaned = line.replace(/^## \d{2}:\d{2} — /, '').trim()

        if (cleaned.length > 10) {
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
