import defaultLogger from '../../logger.js'

/**
 * SemanticMemory - General facts and knowledge
 *
 * Phase 3: Wraps MemoryStore semantic methods
 * Future: Separate facts.md, procedures.md, concepts.md, errors.md
 *
 * Contains:
 * - Facts: General knowledge ("Adrian prefers Spanish")
 * - Procedures: How-to knowledge ("How to debug n8n webhooks")
 * - Concepts: Understanding ("n8n uses query params for auth")
 * - Errors: Lessons learned ("Don't assume Bearer token without checking docs")
 */
export default class SemanticMemory {
  constructor(memoryStore, { logger = defaultLogger } = {}) {
    this.store = memoryStore
    this.logger = logger
  }

  /**
   * Get long-term semantic memory (all facts).
   *
   * @returns {Promise<string>} MEMORY.md content
   */
  async getLongTerm() {
    return this.store.readLongTermMemory()
  }

  /**
   * Get recent semantic notes (last N days).
   *
   * @param {number} days
   * @returns {Promise<string>} Recent daily logs
   */
  async getRecent(days = 3) {
    return this.store.getRecentDays(days)
  }

  /**
   * Add a semantic fact.
   *
   * @param {string} fact - Fact to remember
   * @returns {Promise<void>}
   */
  async addFact(fact) {
    await this.store.appendDaily(fact)

    this.logger.info('semantic-memory', 'fact_added', {
      factLength: fact.length,
      preview: fact.slice(0, 50)
    })
  }

  /**
   * Overwrite long-term memory (for compaction).
   * Use sparingly - prefer appending facts.
   *
   * @param {string} content - Full MEMORY.md content
   * @returns {Promise<void>}
   */
  async writeLongTerm(content) {
    await this.store.writeLongTermMemory(content)

    this.logger.info('semantic-memory', 'long_term_written', {
      contentLength: content.length
    })
  }

  // Future: Separate methods for procedures, concepts, errors
  // async getProcedures() { ... }
  // async addProcedure(procedure) { ... }
  // async getConcepts() { ... }
  // async addConcept(concept) { ... }
  // async getErrors() { ... }
  // async addError(error) { ... }
}
