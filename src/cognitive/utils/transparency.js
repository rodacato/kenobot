import defaultLogger from '../../logger.js'

/**
 * TransparencyManager - Provides visibility into bot's learning and decisions
 *
 * Features:
 * - Learning feedback ("✓ He aprendido que...")
 * - Explain last response (/why command)
 * - Memory statistics (/memory-status command)
 * - Source tracking for facts
 *
 * Phase 6: Basic transparency utilities
 * Future: Detailed decision explanations, confidence scores
 */
export default class TransparencyManager {
  constructor({ logger = defaultLogger } = {}) {
    this.logger = logger

    // Track last response for /why command
    this.lastResponse = new Map() // sessionId -> { response, sources, context }
  }

  /**
   * Generate learning feedback message.
   *
   * @param {string} type - Type of learning ('fact', 'preference', 'pattern')
   * @param {string} content - What was learned
   * @param {string} language - Language ('en' or 'es')
   * @returns {string} Feedback message
   */
  generateLearningFeedback(type, content, language = 'es') {
    const templates = {
      es: {
        fact: `✓ He aprendido que: ${content}`,
        preference: `✓ He guardado tu preferencia: ${content}`,
        pattern: `✓ He identificado un patrón: ${content}`,
        error: `✓ He aprendido de este error: ${content}`
      },
      en: {
        fact: `✓ I learned that: ${content}`,
        preference: `✓ I saved your preference: ${content}`,
        pattern: `✓ I identified a pattern: ${content}`,
        error: `✓ I learned from this error: ${content}`
      }
    }

    const template = templates[language]?.[type] || templates.es[type]

    this.logger.info('transparency', 'learning_feedback', {
      type,
      language,
      contentLength: content.length
    })

    return template
  }

  /**
   * Record response context for /why command.
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} context - Response context
   */
  recordResponse(sessionId, { response, sources = [], reasoning = null, memoryUsed = [] }) {
    this.lastResponse.set(sessionId, {
      response,
      sources,
      reasoning,
      memoryUsed,
      timestamp: Date.now()
    })

    this.logger.info('transparency', 'response_recorded', {
      sessionId,
      sourcesCount: sources.length,
      hasReasoning: !!reasoning
    })
  }

  /**
   * Explain last response (/why command).
   *
   * @param {string} sessionId - Session identifier
   * @param {string} language - Language ('en' or 'es')
   * @returns {string|null} Explanation or null if no last response
   */
  explainLastResponse(sessionId, language = 'es') {
    const context = this.lastResponse.get(sessionId)

    if (!context) {
      return language === 'es'
        ? 'No tengo registro de una respuesta reciente.'
        : 'No record of a recent response.'
    }

    let explanation = language === 'es'
      ? '## Explicación de mi última respuesta\n\n'
      : '## Explanation of my last response\n\n'

    // Memory used
    if (context.memoryUsed.length > 0) {
      explanation += language === 'es'
        ? '**Memoria utilizada:**\n'
        : '**Memory used:**\n'

      for (const memory of context.memoryUsed) {
        explanation += `- ${memory}\n`
      }
      explanation += '\n'
    }

    // Sources
    if (context.sources.length > 0) {
      explanation += language === 'es'
        ? '**Fuentes consultadas:**\n'
        : '**Sources consulted:**\n'

      for (const source of context.sources) {
        explanation += `- ${source}\n`
      }
      explanation += '\n'
    }

    // Reasoning
    if (context.reasoning) {
      explanation += language === 'es'
        ? '**Razonamiento:**\n'
        : '**Reasoning:**\n'

      explanation += `${context.reasoning}\n`
    }

    // Timestamp
    const timeAgo = this.formatTimeAgo(Date.now() - context.timestamp, language)
    explanation += language === 'es'
      ? `\n*Respuesta generada hace ${timeAgo}*`
      : `\n*Response generated ${timeAgo} ago*`

    return explanation
  }

  /**
   * Generate memory status report (/memory-status command).
   *
   * @param {Object} stats - Memory statistics
   * @param {string} language - Language ('en' or 'es')
   * @returns {string} Status report
   */
  generateMemoryStatus(stats, language = 'es') {
    let report = language === 'es'
      ? '## Estado de la Memoria\n\n'
      : '## Memory Status\n\n'

    // Working memory
    if (stats.working) {
      report += language === 'es'
        ? `**Memoria de Trabajo:** ${stats.working.active} activas`
        : `**Working Memory:** ${stats.working.active} active`

      if (stats.working.stale > 0) {
        report += language === 'es'
          ? `, ${stats.working.stale} obsoletas`
          : `, ${stats.working.stale} stale`
      }
      report += '\n'
    }

    // Semantic memory
    if (stats.semantic) {
      report += language === 'es'
        ? `**Memoria Semántica:** ${stats.semantic.facts} hechos`
        : `**Semantic Memory:** ${stats.semantic.facts} facts`

      if (stats.semantic.procedures) {
        report += language === 'es'
          ? `, ${stats.semantic.procedures} procedimientos`
          : `, ${stats.semantic.procedures} procedures`
      }
      report += '\n'
    }

    // Episodic memory
    if (stats.episodic) {
      report += language === 'es'
        ? `**Memoria Episódica:** ${stats.episodic.total} episodios`
        : `**Episodic Memory:** ${stats.episodic.total} episodes`

      if (stats.episodic.chatSpecific) {
        report += language === 'es'
          ? ` (${stats.episodic.chatSpecific} de este chat)`
          : ` (${stats.episodic.chatSpecific} from this chat)`
      }
      report += '\n'
    }

    // Procedural memory
    if (stats.procedural) {
      report += language === 'es'
        ? `**Memoria Procedimental:** ${stats.procedural.patterns} patrones aprendidos\n`
        : `**Procedural Memory:** ${stats.procedural.patterns} learned patterns\n`
    }

    // Last sleep cycle
    if (stats.sleepCycle) {
      report += '\n'
      report += language === 'es'
        ? `**Último Ciclo de Sueño:** ${this.formatTimeAgo(Date.now() - stats.sleepCycle.lastRun, language)}\n`
        : `**Last Sleep Cycle:** ${this.formatTimeAgo(Date.now() - stats.sleepCycle.lastRun, language)} ago\n`
    }

    return report
  }

  /**
   * Format time elapsed in human-readable format.
   *
   * @param {number} ms - Milliseconds elapsed
   * @param {string} language - Language
   * @returns {string} Formatted time
   */
  formatTimeAgo(ms, language = 'es') {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return language === 'es'
        ? `${days} día${days > 1 ? 's' : ''}`
        : `${days} day${days > 1 ? 's' : ''}`
    }

    if (hours > 0) {
      return language === 'es'
        ? `${hours} hora${hours > 1 ? 's' : ''}`
        : `${hours} hour${hours > 1 ? 's' : ''}`
    }

    if (minutes > 0) {
      return language === 'es'
        ? `${minutes} minuto${minutes > 1 ? 's' : ''}`
        : `${minutes} minute${minutes > 1 ? 's' : ''}`
    }

    return language === 'es'
      ? `${seconds} segundo${seconds > 1 ? 's' : ''}`
      : `${seconds} second${seconds > 1 ? 's' : ''}`
  }
}
