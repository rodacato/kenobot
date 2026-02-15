import KeywordMatcher from './keyword-matcher.js'
import ConfidenceScorer from './confidence-scorer.js'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * RetrievalEngine - Selective memory retrieval system
 *
 * Phase 2: Keyword-based retrieval with scoring
 * Phase 4+: Could add embeddings-based retrieval if needed
 *
 * Orchestrates:
 * - Keyword extraction and matching
 * - Confidence scoring
 * - Result limiting and prioritization
 */
export default class RetrievalEngine {
  constructor(memorySystem, { logger = defaultLogger } = {}) {
    this.memorySystem = memorySystem
    this.keywordMatcher = new KeywordMatcher({ logger })
    this.confidenceScorer = new ConfidenceScorer({ logger })
    this.logger = logger
  }

  /**
   * Retrieve relevant memory for a message.
   *
   * @param {string} sessionId - Session ID
   * @param {string} messageText - User message
   * @param {Object} limits - Result limits
   * @param {number} [limits.maxFacts=10] - Max facts to retrieve
   * @param {number} [limits.maxProcedures=5] - Max procedures to retrieve
   * @param {number} [limits.maxEpisodes=3] - Max episodes to retrieve
   * @returns {Promise<{facts: Array, procedures: Array, episodes: Array, confidence: Object, metadata: Object}>}
   */
  async retrieve(sessionId, messageText, limits = {}) {
    const { maxFacts = 10, maxProcedures = 5, maxEpisodes = 3 } = limits

    const startTime = Date.now()

    try {
      // 1. Extract keywords from message
      const keywords = this.keywordMatcher.extractKeywords(messageText)

      this.logger.info('retrieval-engine', 'keywords_extracted', {
        sessionId,
        keywords,
        messageLength: messageText.length
      })

      // 2. Retrieve from each memory type
      const [facts, procedures, episodes] = await Promise.all([
        this._retrieveFacts(keywords, maxFacts),
        this._retrieveProcedures(keywords, maxProcedures),
        this._retrieveEpisodes(sessionId, keywords, maxEpisodes)
      ])

      // 3. Score confidence
      const confidence = this.confidenceScorer.score({ facts, procedures, episodes })

      // 4. Build result
      const result = {
        facts,
        procedures,
        episodes,
        confidence,
        metadata: {
          keywords,
          latency: Date.now() - startTime,
          timestamp: Date.now(),
          sessionId
        }
      }

      this.logger.info('retrieval-engine', 'retrieve_complete', {
        sessionId,
        confidence: confidence.level,
        latency: result.metadata.latency,
        totalResults: facts.length + procedures.length + episodes.length
      })

      return result
    } catch (error) {
      this.logger.error('retrieval-engine', 'retrieve_error', {
        sessionId,
        error: error.message,
        latency: Date.now() - startTime
      })

      // Return empty results on error
      return {
        facts: [],
        procedures: [],
        episodes: [],
        confidence: { level: 'none', score: 0, breakdown: {}, metadata: { error: error.message } },
        metadata: {
          keywords: [],
          latency: Date.now() - startTime,
          timestamp: Date.now(),
          sessionId,
          error: error.message
        }
      }
    }
  }

  /**
   * Retrieve facts from semantic memory.
   * @private
   */
  async _retrieveFacts(keywords, limit) {
    // Phase 2: Use existing getLongTermMemory (returns markdown string)
    // Phase 3: Will use semantic memory methods
    const factsText = await this.memorySystem.getLongTermMemory()

    if (!factsText) return []

    // Parse markdown into sections (simple split by headings)
    const facts = this._parseMarkdownSections(factsText)

    // Search with keywords
    return this.keywordMatcher.search(facts, keywords, limit)
  }

  /**
   * Retrieve procedures from semantic memory.
   * @private
   */
  async _retrieveProcedures(keywords, limit) {
    // Phase 2: Procedures are not separate yet
    // Phase 3: Will have dedicated procedures.md
    // For now, return empty
    return []
  }

  /**
   * Retrieve episodes from episodic memory.
   * @private
   */
  async _retrieveEpisodes(sessionId, keywords, limit) {
    // Phase 2: Use existing getRecentDays
    // Phase 3: Will use episodic memory methods
    const episodesText = await this.memorySystem.getChatRecentDays(sessionId, 7)

    if (!episodesText) return []

    // Parse daily logs into sections
    const episodes = this._parseMarkdownSections(episodesText)

    // Search with keywords
    return this.keywordMatcher.search(episodes, keywords, limit)
  }

  /**
   * Parse markdown text into searchable sections.
   * @private
   * @param {string} markdown
   * @returns {Array<{content: string, metadata?: Object}>}
   */
  _parseMarkdownSections(markdown) {
    if (!markdown) return []

    // Split by markdown headings (##, ###, etc.)
    const sections = []
    const lines = markdown.split('\n')
    let currentSection = []
    let currentHeading = null

    for (const line of lines) {
      // Check if line is a heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

      if (headingMatch) {
        // Save previous section
        if (currentSection.length > 0) {
          sections.push({
            content: currentSection.join('\n').trim(),
            metadata: { heading: currentHeading }
          })
        }

        // Start new section
        currentHeading = headingMatch[2]
        currentSection = [line]
      } else {
        currentSection.push(line)
      }
    }

    // Save last section
    if (currentSection.length > 0) {
      sections.push({
        content: currentSection.join('\n').trim(),
        metadata: { heading: currentHeading }
      })
    }

    // Filter out empty sections
    return sections.filter(s => s.content.length > 0)
  }
}
