import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * IntegrityChecker - Heuristic identity drift detection
 *
 * Runs during sleep cycle (zero LLM cost). Compares recent bot behavior
 * against identity rules to detect drift:
 * - Forbidden patterns appearing in recent responses
 * - Rule violations (e.g., using filler phrases)
 * - Excessive preference changes
 *
 * Output: { driftDetected, score, findings }
 */
export default class IntegrityChecker {
  constructor(identityPath, { logger = defaultLogger } = {}) {
    this.identityPath = identityPath
    this.logger = logger
  }

  /**
   * Run integrity check against recent episodes.
   *
   * @param {Array<string>} recentResponses - Bot responses to check
   * @returns {Promise<{driftDetected: boolean, score: number, findings: Array}>}
   */
  async check(recentResponses = []) {
    this.logger.info('integrity-checker', 'started', { responseCount: recentResponses.length })

    const findings = []

    // Load identity rules
    const rules = await this._loadRules()
    if (!rules) {
      return { driftDetected: false, score: 0, findings: [] }
    }

    // Check forbidden patterns from rules
    for (const rule of rules) {
      if (!rule.forbidden_patterns?.length) continue

      for (const response of recentResponses) {
        for (const pattern of rule.forbidden_patterns) {
          if (response.toLowerCase().includes(pattern.toLowerCase())) {
            findings.push({
              type: 'forbidden_pattern',
              rule: rule.id,
              pattern,
              severity: 'medium'
            })
          }
        }
      }
    }

    // Check response style violations (heuristic)
    const avgLength = recentResponses.length > 0
      ? recentResponses.reduce((sum, r) => sum + r.length, 0) / recentResponses.length
      : 0

    // Extremely long responses might indicate verbosity drift
    if (avgLength > 2000 && recentResponses.length >= 3) {
      findings.push({
        type: 'style_drift',
        rule: 'no_filler',
        detail: `Average response length ${Math.round(avgLength)} chars (may indicate verbosity)`,
        severity: 'low'
      })
    }

    // Calculate drift score (0-1)
    const score = Math.min(1, findings.length * 0.2)
    const driftDetected = score >= 0.4

    const result = { driftDetected, score, findings }
    this.logger.info('integrity-checker', 'completed', {
      driftDetected,
      score,
      findingCount: findings.length
    })

    return result
  }

  /**
   * Load rules.json from identity path.
   * @private
   * @returns {Promise<Array|null>}
   */
  async _loadRules() {
    try {
      const rulesPath = join(this.identityPath, 'rules.json')
      const content = await readFile(rulesPath, 'utf8')
      const data = JSON.parse(content)
      return data.rules || []
    } catch {
      this.logger.warn('integrity-checker', 'rules_not_found', { path: this.identityPath })
      return null
    }
  }
}
