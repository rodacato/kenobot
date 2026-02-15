import fs from 'fs/promises'
import path from 'path'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * PreferencesManager - Manages user-specific learned preferences
 *
 * preferences.md structure:
 * # User Preferences
 *
 * ## Communication Style
 * - Prefers concise responses
 * - Spanish preferred for casual conversation
 *
 * ## Technical Preferences
 * - Uses vim for editing
 * - Prefers functional programming patterns
 *
 * Phase 5: Basic CRUD operations
 * Phase 6: Structured format, semantic deduplication
 */
export default class PreferencesManager {
  constructor(identityPath, { logger = defaultLogger } = {}) {
    this.identityPath = identityPath
    this.logger = logger
    this.preferencesPath = path.join(identityPath, 'preferences.md')
    this.bootstrapPath = path.join(identityPath, 'BOOTSTRAP.md')
  }

  /**
   * Load preferences from preferences.md
   *
   * @returns {Promise<string>} Preferences content
   */
  async load() {
    try {
      const content = await fs.readFile(this.preferencesPath, 'utf-8')

      this.logger.info('preferences-manager', 'loaded', {
        length: content.length,
        path: this.preferencesPath
      })

      return content.trim()
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('preferences-manager', 'not_found', {
          path: this.preferencesPath
        })
        return ''
      }

      this.logger.error('preferences-manager', 'load_failed', {
        error: error.message,
        path: this.preferencesPath
      })

      throw error
    }
  }

  /**
   * Check if bootstrap is complete.
   *
   * @returns {Promise<boolean>}
   */
  async isBootstrapped() {
    try {
      await fs.access(this.bootstrapPath)
      // BOOTSTRAP.md exists = bootstrap NOT complete
      return false
    } catch {
      // BOOTSTRAP.md does not exist = bootstrap complete
      return true
    }
  }

  /**
   * Get bootstrap instructions.
   *
   * @returns {Promise<string|null>} Bootstrap content or null if complete
   */
  async getBootstrapInstructions() {
    try {
      const content = await fs.readFile(this.bootstrapPath, 'utf-8')

      this.logger.info('preferences-manager', 'bootstrap_loaded', {
        length: content.length
      })

      return content.trim()
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null
      }

      this.logger.error('preferences-manager', 'bootstrap_load_failed', {
        error: error.message
      })

      throw error
    }
  }

  /**
   * Save bootstrap answers and mark bootstrap as complete.
   *
   * @param {Object} answers - Bootstrap answers
   * @returns {Promise<void>}
   */
  async saveBootstrapAnswers(answers) {
    // Convert answers to markdown
    let content = '# User Preferences\n\n'
    content += '## From Bootstrap\n\n'

    for (const [question, answer] of Object.entries(answers)) {
      content += `- ${question}: ${answer}\n`
    }

    // Append to existing preferences or create new
    const existing = await this.load()
    if (existing) {
      content = `${existing}\n\n${content}`
    }

    await fs.writeFile(this.preferencesPath, content, 'utf-8')

    // Delete BOOTSTRAP.md to mark as complete
    try {
      await fs.unlink(this.bootstrapPath)
      this.logger.info('preferences-manager', 'bootstrap_completed', {})
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn('preferences-manager', 'bootstrap_delete_failed', {
          error: error.message
        })
      }
    }
  }

  /**
   * Update a single preference.
   *
   * @param {string} key - Preference key
   * @param {string} value - Preference value
   * @returns {Promise<void>}
   */
  async updatePreference(key, value) {
    const existing = await this.load()

    // Simple append for now
    // Phase 6: Parse and deduplicate
    const newLine = `- ${key}: ${value}`

    const content = existing
      ? `${existing}\n${newLine}`
      : `# User Preferences\n\n${newLine}`

    await fs.writeFile(this.preferencesPath, content, 'utf-8')

    this.logger.info('preferences-manager', 'preference_updated', { key })
  }

  /**
   * Check if preferences file exists.
   *
   * @returns {Promise<boolean>}
   */
  async hasPreferences() {
    try {
      const content = await this.load()
      return content.length > 0
    } catch {
      return false
    }
  }
}
