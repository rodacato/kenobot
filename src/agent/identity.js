import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import defaultLogger from '../logger.js'

/**
 * IdentityLoader - Loads modular identity files (SOUL.md, IDENTITY.md, USER.md)
 *
 * Expects a directory with SOUL.md, IDENTITY.md, USER.md files.
 *
 * Caching policy:
 *   - SOUL.md + IDENTITY.md: cached at startup, reloaded via reload()
 *   - USER.md: fresh read every request (bot can write to it)
 */
export default class IdentityLoader {
  constructor(identityPath, { logger = defaultLogger } = {}) {
    this.identityPath = identityPath
    this.logger = logger
    this._soul = ''
    this._identity = ''
  }

  /**
   * Load and cache identity files from directory.
   * Called once at startup by AgentLoop via ContextBuilder.
   */
  async load() {
    this._soul = await this._readSafe(join(this.identityPath, 'SOUL.md'))
    this._identity = await this._readSafe(join(this.identityPath, 'IDENTITY.md'))
    const hasBootstrap = await this._readSafe(join(this.identityPath, 'BOOTSTRAP.md'))
    this.logger.info('identity', 'loaded', {
      path: this.identityPath,
      soul: this._soul.length,
      identity: this._identity.length,
      bootstrap: hasBootstrap.length > 0
    })
    if (hasBootstrap) {
      this.logger.info('identity', 'bootstrap_pending', {
        hint: 'First conversation will trigger onboarding flow'
      })
    }
    if (!this._soul && !this._identity) {
      this.logger.warn('identity', 'empty_identity', {
        path: this.identityPath,
        hint: 'Bot will run without personality. Check IDENTITY_FILE path or run kenobot setup'
      })
    }
  }

  /**
   * Return cached soul content (sync).
   * @returns {string}
   */
  getSoul() {
    return this._soul
  }

  /**
   * Return cached identity content (sync).
   * @returns {string}
   */
  getIdentity() {
    return this._identity
  }

  /**
   * Read USER.md fresh from disk (not cached).
   * Returns empty string if file doesn't exist.
   * @returns {Promise<string>}
   */
  async getUser() {
    const userPath = join(this.identityPath, 'USER.md')
    const content = await this._readSafe(userPath)

    if (content.length > 5120) {
      this.logger.warn('identity', 'user_file_large', {
        file: 'USER.md',
        sizeBytes: content.length,
        hint: 'Consider curating USER.md to keep it under 5KB for optimal context usage'
      })
    }

    return content
  }

  /**
   * Append entries to the "Learned Preferences" section of USER.md.
   * Creates the section if it doesn't exist.
   * @param {string[]} entries - Preference entries to append
   */
  async appendUser(entries) {
    if (entries.length === 0) return

    const userPath = join(this.identityPath, 'USER.md')
    await mkdir(this.identityPath, { recursive: true })

    let content = await this._readSafe(userPath)
    const newLines = entries.map(e => `- ${e}`).join('\n')

    if (content.includes('## Learned Preferences')) {
      // Append after the heading
      content = content.replace(
        /(## Learned Preferences\n)/,
        `$1${newLines}\n`
      )
    } else {
      // Add new section at the end
      const separator = content.length > 0 ? '\n\n' : ''
      content += `${separator}## Learned Preferences\n${newLines}\n`
    }

    await writeFile(userPath, content, 'utf8')
    this.logger.info('identity', 'user_updated', { entries: entries.length })
  }

  /**
   * Read BOOTSTRAP.md if it exists.
   * Returns null when no bootstrap is pending.
   * @returns {Promise<string|null>}
   */
  async getBootstrap() {
    const content = await this._readSafe(join(this.identityPath, 'BOOTSTRAP.md'))
    return content || null
  }

  /**
   * Delete BOOTSTRAP.md after bootstrap conversation is complete.
   * No-op if file is already gone.
   */
  async deleteBootstrap() {
    try {
      await unlink(join(this.identityPath, 'BOOTSTRAP.md'))
      this.logger.info('identity', 'bootstrap_deleted', { path: this.identityPath })
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  /**
   * Force reload SOUL.md and IDENTITY.md from disk.
   */
  async reload() {
    this._soul = await this._readSafe(join(this.identityPath, 'SOUL.md'))
    this._identity = await this._readSafe(join(this.identityPath, 'IDENTITY.md'))
    this.logger.info('identity', 'reloaded', {
      soul: this._soul.length,
      identity: this._identity.length
    })
  }

  /**
   * Read a file, returning empty string on ENOENT.
   * @private
   */
  async _readSafe(filepath) {
    try {
      return await readFile(filepath, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return ''
      throw err
    }
  }
}
