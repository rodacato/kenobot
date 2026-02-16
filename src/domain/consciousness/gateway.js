import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * Consciousness Gateway — domain port for the fast secondary model.
 *
 * Provides one-shot evaluations using expert profiles.
 * Any subsystem calls evaluate(expertName, taskName, data) → Object|null.
 * Returns null on any failure (adapter error, JSON parse, timeout, disabled).
 * Callers treat null as "fall back to heuristic".
 */
export default class ConsciousnessGateway {
  constructor({ adapter, profilesDir, logger = defaultLogger, enabled = true } = {}) {
    this.adapter = adapter
    this.logger = logger
    this.enabled = enabled
    this.profiles = new Map()
    this._stats = { calls: 0, successes: 0, failures: 0, totalLatencyMs: 0, lastCallAt: null }

    if (profilesDir) {
      this._loadProfiles(profilesDir)
    }
  }

  /**
   * Evaluate a task using an expert profile.
   * @param {string} expertName - Profile name (e.g. 'semantic-analyst')
   * @param {string} taskName - Task within the profile (e.g. 'expand_keywords')
   * @param {Object} data - Template variables to interpolate
   * @returns {Promise<Object|null>} Parsed JSON result, or null on failure
   */
  async evaluate(expertName, taskName, data = {}) {
    if (!this.enabled) return null
    if (!this.adapter) return null

    const profile = this.profiles.get(expertName)
    if (!profile) {
      this.logger.warn('consciousness', 'unknown_expert', { expertName })
      return null
    }

    const task = profile.tasks?.[taskName]
    if (!task) {
      this.logger.warn('consciousness', 'unknown_task', { expertName, taskName })
      return null
    }

    const taskPrompt = this._interpolate(task.promptTemplate, data)

    this._stats.calls++
    const evalStart = Date.now()
    try {
      const raw = await this.adapter.call(profile.systemPrompt, taskPrompt)
      const result = this._parseJSON(raw)
      this._stats.successes++
      return result
    } catch (error) {
      this._stats.failures++
      this.logger.warn('consciousness', 'evaluation_failed', {
        expertName, taskName, error: error.message
      })
      return null
    } finally {
      this._stats.totalLatencyMs += Date.now() - evalStart
      this._stats.lastCallAt = Date.now()
    }
  }

  /**
   * Get runtime statistics for observability.
   * @returns {Object} Stats snapshot
   */
  getStats() {
    const { calls, successes, failures, totalLatencyMs, lastCallAt } = this._stats
    return {
      enabled: this.enabled,
      profiles: [...this.profiles.keys()],
      calls,
      successes,
      failures,
      fallbackRate: calls > 0 ? ((failures / calls) * 100).toFixed(1) : '0.0',
      avgLatencyMs: calls > 0 ? Math.round(totalLatencyMs / calls) : 0,
      lastCallAt
    }
  }

  /**
   * Load expert profiles from a directory of JSON files.
   * @private
   */
  _loadProfiles(dir) {
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.json'))
      for (const file of files) {
        const content = readFileSync(join(dir, file), 'utf8')
        const profile = JSON.parse(content)
        if (profile.name) {
          this.profiles.set(profile.name, profile)
        }
      }
      this.logger.info('consciousness', 'profiles_loaded', {
        count: this.profiles.size,
        names: [...this.profiles.keys()]
      })
    } catch (error) {
      this.logger.warn('consciousness', 'profiles_load_failed', { error: error.message })
    }
  }

  /**
   * Interpolate {variable} placeholders in a template string.
   * @private
   */
  _interpolate(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match
    })
  }

  /**
   * Parse JSON from model response, stripping markdown fences if present.
   * @private
   */
  _parseJSON(raw) {
    let cleaned = raw.trim()

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m)
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim()
    }

    return JSON.parse(cleaned)
  }
}
