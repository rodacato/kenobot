import fs from 'fs/promises'
import path from 'path'
import defaultLogger from '../../logger.js'

/**
 * CoreLoader - Loads immutable core personality
 *
 * core.md contains the foundational personality traits,
 * communication style, and core values of the bot.
 * This file should rarely change.
 *
 * Phase 5: Simple file loading
 * Phase 6: Validation and versioning
 */
export default class CoreLoader {
  constructor(identityPath, { logger = defaultLogger } = {}) {
    this.identityPath = identityPath
    this.logger = logger
    this.corePath = path.join(identityPath, 'core.md')
    this.cache = null
  }

  /**
   * Load core personality from core.md
   *
   * @returns {Promise<string>} Core personality content
   */
  async load() {
    // Return cached core if available
    if (this.cache !== null) {
      return this.cache
    }

    try {
      const content = await fs.readFile(this.corePath, 'utf-8')
      this.cache = content.trim()

      this.logger.info('core-loader', 'loaded', {
        length: this.cache.length,
        path: this.corePath
      })

      return this.cache
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn('core-loader', 'not_found', {
          path: this.corePath
        })
        return ''
      }

      this.logger.error('core-loader', 'load_failed', {
        error: error.message,
        path: this.corePath
      })

      throw error
    }
  }

  /**
   * Reload core from disk (clear cache).
   *
   * @returns {Promise<string>}
   */
  async reload() {
    this.cache = null
    return this.load()
  }

  /**
   * Check if core.md exists.
   *
   * @returns {Promise<boolean>}
   */
  async exists() {
    try {
      await fs.access(this.corePath)
      return true
    } catch {
      return false
    }
  }
}
