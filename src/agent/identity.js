import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import logger from '../logger.js'

/**
 * IdentityLoader - Loads modular identity files (SOUL.md, IDENTITY.md, USER.md)
 *
 * Supports two modes:
 *   - File mode: single .md file (backwards compat with identities/kenobot.md)
 *   - Directory mode: directory with SOUL.md, IDENTITY.md, USER.md
 *
 * Detection is automatic based on whether the path is a file or directory.
 *
 * Caching policy:
 *   - SOUL.md + IDENTITY.md: cached at startup, reloaded via reload()
 *   - USER.md: fresh read every request (bot can write to it)
 */
export default class IdentityLoader {
  constructor(identityPath) {
    this.identityPath = identityPath
    this._isDirectory = null
    this._soul = ''
    this._identity = ''
  }

  /**
   * Detect file vs directory mode and load cached files.
   * Called once at startup by AgentLoop via ContextBuilder.
   */
  async load() {
    this._isDirectory = await this._detectDirectory()

    if (this._isDirectory) {
      this._soul = await this._readSafe(join(this.identityPath, 'SOUL.md'))
      this._identity = await this._readSafe(join(this.identityPath, 'IDENTITY.md'))
      const hasBootstrap = await this._readSafe(join(this.identityPath, 'BOOTSTRAP.md'))
      logger.info('identity', 'loaded_directory', {
        path: this.identityPath,
        soul: this._soul.length,
        identity: this._identity.length,
        bootstrap: hasBootstrap.length > 0
      })
      if (hasBootstrap) {
        logger.info('identity', 'bootstrap_pending', {
          hint: 'First conversation will trigger onboarding flow'
        })
      }
    } else {
      // File mode: entire file is treated as soul
      this._soul = await this._readSafe(this.identityPath)
      this._identity = ''
      logger.info('identity', 'loaded_file', {
        path: this.identityPath,
        length: this._soul.length
      })
      if (!this._soul) {
        logger.warn('identity', 'empty_identity', {
          path: this.identityPath,
          hint: 'Bot will run without personality. Check IDENTITY_FILE path or run kenobot init'
        })
      }
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
   * Returns empty string if file doesn't exist or not in directory mode.
   * @returns {Promise<string>}
   */
  async getUser() {
    if (!this._isDirectory) return ''

    const userPath = join(this.identityPath, 'USER.md')
    const content = await this._readSafe(userPath)

    if (content.length > 5120) {
      logger.warn('identity', 'user_file_large', {
        file: 'USER.md',
        sizeBytes: content.length,
        hint: 'Consider curating USER.md to keep it under 5KB for optimal context usage'
      })
    }

    return content
  }

  /**
   * Append entries to the "Learned Preferences" section of USER.md.
   * Creates the section if it doesn't exist. No-op in file mode.
   * @param {string[]} entries - Preference entries to append
   */
  async appendUser(entries) {
    if (!this._isDirectory || entries.length === 0) return

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
    logger.info('identity', 'user_updated', { entries: entries.length })
  }

  /**
   * Read BOOTSTRAP.md if it exists (directory mode only).
   * Returns null when no bootstrap is pending.
   * @returns {Promise<string|null>}
   */
  async getBootstrap() {
    if (!this._isDirectory) return null
    const content = await this._readSafe(join(this.identityPath, 'BOOTSTRAP.md'))
    return content || null
  }

  /**
   * Delete BOOTSTRAP.md after bootstrap conversation is complete.
   * No-op in file mode or if file is already gone.
   */
  async deleteBootstrap() {
    if (!this._isDirectory) return
    try {
      await unlink(join(this.identityPath, 'BOOTSTRAP.md'))
      logger.info('identity', 'bootstrap_deleted', { path: this.identityPath })
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  /**
   * Force reload SOUL.md and IDENTITY.md from disk.
   * Called after an approval activates identity/soul changes.
   */
  async reload() {
    if (this._isDirectory) {
      this._soul = await this._readSafe(join(this.identityPath, 'SOUL.md'))
      this._identity = await this._readSafe(join(this.identityPath, 'IDENTITY.md'))
      logger.info('identity', 'reloaded', {
        soul: this._soul.length,
        identity: this._identity.length
      })
    } else {
      this._soul = await this._readSafe(this.identityPath)
      logger.info('identity', 'reloaded', { length: this._soul.length })
    }
  }

  /**
   * Check whether identityPath is a directory.
   * Falls back: if path doesn't exist, checks for path.md file.
   * @private
   */
  async _detectDirectory() {
    try {
      const s = await stat(this.identityPath)
      return s.isDirectory()
    } catch (err) {
      if (err.code !== 'ENOENT') throw err

      // Path doesn't exist — check if it's a directory reference missing .md
      // e.g. "identities/kenobot" when "identities/kenobot.md" exists
      try {
        const s = await stat(this.identityPath + '.md')
        if (s.isFile()) {
          this.identityPath = this.identityPath + '.md'
          return false
        }
      } catch {
        // Neither exists — will load as empty
      }
      return false
    }
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
