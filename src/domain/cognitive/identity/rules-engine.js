import fs from 'fs/promises'
import path from 'path'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * RulesEngine - Interprets and applies behavioral rules
 *
 * rules.json structure:
 * {
 *   "behavioral": [
 *     {
 *       "category": "communication",
 *       "instruction": "Use natural language, avoid filler phrases",
 *       "examples": ["Good: Let's do it", "Bad: Let me just go ahead and..."]
 *     }
 *   ],
 *   "forbidden": [
 *     {"pattern": "let me just", "reason": "Unnecessary filler"}
 *   ]
 * }
 *
 * Phase 5: Basic rule loading and formatting
 * Phase 6: Rule validation, dynamic updates, pattern matching
 */
export default class RulesEngine {
  constructor(identityPath, { logger = defaultLogger } = {}) {
    this.identityPath = identityPath
    this.logger = logger
    this.rulesPath = path.join(identityPath, 'rules.json')
    this.cache = null
  }

  /**
   * Load rules from rules.json
   *
   * @returns {Promise<Object>} Rules object
   */
  async loadRules() {
    if (this.cache !== null) {
      return this.cache
    }

    try {
      const content = await fs.readFile(this.rulesPath, 'utf-8')
      this.cache = JSON.parse(content)

      this.logger.debug('rules-engine', 'loaded', {
        behavioralCount: this.cache.behavioral?.length || 0,
        forbiddenCount: this.cache.forbidden?.length || 0,
        path: this.rulesPath
      })

      return this.cache
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('rules-engine', 'not_found', {
          path: this.rulesPath
        })

        // Return empty rules
        this.cache = { behavioral: [], forbidden: [] }
        return this.cache
      }

      this.logger.error('rules-engine', 'load_failed', {
        error: error.message,
        path: this.rulesPath
      })

      throw error
    }
  }

  /**
   * Format rules for LLM system prompt.
   *
   * @param {Object} rules - Rules object
   * @returns {string} Formatted rules as natural language
   */
  formatRulesForPrompt(rules) {
    if (!rules || (!rules.behavioral?.length && !rules.forbidden?.length)) {
      return ''
    }

    let prompt = ''

    // Behavioral rules
    if (rules.behavioral?.length > 0) {
      prompt += '## Behavioral Guidelines\n\n'

      const grouped = this.groupByCategory(rules.behavioral)

      for (const [category, categoryRules] of Object.entries(grouped)) {
        prompt += `### ${this.capitalizeCategory(category)}\n\n`

        for (const rule of categoryRules) {
          prompt += `- ${rule.instruction}\n`

          if (rule.examples?.length > 0) {
            prompt += '  Examples:\n'
            for (const example of rule.examples) {
              prompt += `  - ${example}\n`
            }
          }
          prompt += '\n'
        }
      }
    }

    // Forbidden patterns
    if (rules.forbidden?.length > 0) {
      prompt += '## Forbidden Patterns\n\n'
      prompt += 'Avoid these patterns in your responses:\n\n'

      for (const forbidden of rules.forbidden) {
        prompt += `- "${forbidden.pattern}"`
        if (forbidden.reason) {
          prompt += ` (${forbidden.reason})`
        }
        prompt += '\n'
      }
    }

    return prompt.trim()
  }

  /**
   * Group rules by category.
   *
   * @param {Array} rules - Behavioral rules
   * @returns {Object} Rules grouped by category
   */
  groupByCategory(rules) {
    const grouped = {}

    for (const rule of rules) {
      const category = rule.category || 'general'

      if (!grouped[category]) {
        grouped[category] = []
      }

      grouped[category].push(rule)
    }

    return grouped
  }

  /**
   * Capitalize category name.
   *
   * @param {string} category - Category name
   * @returns {string} Capitalized category
   */
  capitalizeCategory(category) {
    return category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Validate response against forbidden patterns.
   *
   * @param {string} response - Response to validate
   * @returns {Promise<Array<string>>} Violations found (empty if valid)
   */
  async validateResponse(response) {
    const rules = await this.loadRules()
    const violations = []

    if (!rules.forbidden || rules.forbidden.length === 0) {
      return violations
    }

    const lowerResponse = response.toLowerCase()

    for (const forbidden of rules.forbidden) {
      if (lowerResponse.includes(forbidden.pattern.toLowerCase())) {
        violations.push(forbidden.pattern)
      }
    }

    return violations
  }

  /**
   * Reload rules from disk (clear cache).
   *
   * @returns {Promise<Object>}
   */
  async reload() {
    this.cache = null
    return this.loadRules()
  }
}
