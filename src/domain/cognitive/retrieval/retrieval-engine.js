import KeywordMatcher from './keyword-matcher.js'
import EmbeddingMatcher from './embedding-matcher.js'
import ConfidenceScorer from './confidence-scorer.js'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * RetrievalEngine - Selective memory retrieval system
 *
 * Supports keyword-only or hybrid (keyword + embedding) retrieval.
 * When an embeddingMatcher is provided, runs both in parallel and
 * merges results using Reciprocal Rank Fusion (RRF).
 *
 * Orchestrates:
 * - Keyword extraction and matching
 * - Embedding-based semantic search (optional)
 * - Confidence scoring
 * - Result limiting and prioritization
 */
export default class RetrievalEngine {
  constructor(memorySystem, { logger = defaultLogger, consciousness, embeddingMatcher } = {}) {
    this.memorySystem = memorySystem
    this.keywordMatcher = new KeywordMatcher({ logger, consciousness })
    this.confidenceScorer = new ConfidenceScorer({ logger })
    this.embeddingMatcher = embeddingMatcher || null
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
  async retrieve(sessionId, messageText, limits = {}, context = {}) {
    const { maxFacts = 10, maxProcedures = 5, maxEpisodes = 3 } = limits

    const startTime = Date.now()

    try {
      // 1. Extract keywords from message (consciousness-enhanced if available)
      const keywords = await this.keywordMatcher.extractKeywordsEnhanced(messageText, {
        chatContext: context.chatContext || ''
      })

      this.logger.debug('retrieval-engine', 'keywords_extracted', {
        sessionId,
        keywords,
        messageLength: messageText.length
      })

      // 2. Retrieve from each memory type (pass messageText for hybrid search)
      const [facts, procedures, episodes] = await Promise.all([
        this._retrieveFacts(keywords, maxFacts, messageText),
        this._retrieveProcedures(keywords, maxProcedures),
        this._retrieveEpisodes(sessionId, keywords, maxEpisodes, messageText)
      ])

      // 3. Score confidence
      const confidence = this.confidenceScorer.score({ facts, procedures, episodes })

      // 4. Build result
      const mode = this.embeddingMatcher ? 'hybrid' : 'keyword_only'
      const result = {
        facts,
        procedures,
        episodes,
        confidence,
        metadata: {
          keywords,
          mode,
          latency: Date.now() - startTime,
          timestamp: Date.now(),
          sessionId
        }
      }

      this.logger.debug('retrieval-engine', 'retrieve_complete', {
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
   * Uses hybrid search (keyword + embedding) when embeddingMatcher is available.
   * @private
   */
  async _retrieveFacts(keywords, limit, messageText) {
    const factsText = await this.memorySystem.getLongTermMemory()
    if (!factsText) return []

    const facts = this._parseMarkdownSections(factsText)
    const keywordResults = this.keywordMatcher.search(facts, keywords, limit)

    if (!this.embeddingMatcher || !messageText) return keywordResults

    const embeddingResults = await this.embeddingMatcher.search(messageText, 'semantic', limit)
    if (embeddingResults.length === 0) return keywordResults

    return EmbeddingMatcher.mergeWithRRF(keywordResults, embeddingResults).slice(0, limit)
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
   * Uses hybrid search (keyword + embedding) when embeddingMatcher is available.
   * @private
   */
  async _retrieveEpisodes(sessionId, keywords, limit, messageText) {
    const episodesText = await this.memorySystem.getChatRecentDays(sessionId, 7)
    if (!episodesText) return []

    const episodes = this._parseMarkdownSections(episodesText)
    const keywordResults = this.keywordMatcher.search(episodes, keywords, limit)

    if (!this.embeddingMatcher || !messageText) return keywordResults

    const embeddingResults = await this.embeddingMatcher.search(
      messageText, 'episodic', limit, { sessionId }
    )
    if (embeddingResults.length === 0) return keywordResults

    return EmbeddingMatcher.mergeWithRRF(keywordResults, embeddingResults).slice(0, limit)
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
