import { execFile } from 'node:child_process'
import { writeFile, access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import logger from './logger.js'

const execFileAsync = promisify(execFile)

/**
 * ConfigSync - Auto-sync config/data to a private git repo
 *
 * When CONFIG_REPO is set, automatically commits and pushes config changes
 * (identities, skills, memory) to a private git repository for backup.
 *
 * Uses debounced sync: changes within 30s are batched into one commit.
 * Sync failures are logged but never crash the bot.
 */
export default class ConfigSync {
  /**
   * @param {string} homeDir - KenoBot home directory (~/.kenobot)
   * @param {Object} options
   * @param {string} options.repoUrl - Git remote URL
   * @param {string} options.sshKeyPath - Path to SSH key for push
   * @param {number} options.debounceMs - Debounce interval (default: 30000)
   */
  constructor(homeDir, { repoUrl, sshKeyPath, debounceMs } = {}) {
    this.homeDir = homeDir
    this.repoUrl = repoUrl
    this.sshKeyPath = sshKeyPath || ''
    this.debounceMs = debounceMs ?? 30000
    this._timer = null
    this._syncing = false
  }

  /**
   * Initialize: ensure git repo, set remote, create .gitignore, pull latest.
   * No-op if repoUrl is not set.
   */
  async init() {
    if (!this.repoUrl) return

    await this._ensureGitRepo()
    await this._ensureRemote()
    await this._ensureGitignore()
    await this._ensureGitConfig()
    await this._pull()

    logger.info('config-sync', 'initialized', { repo: this.repoUrl })
  }

  /**
   * Schedule a debounced sync. Multiple calls within debounceMs
   * are batched into a single commit+push.
   * @param {string} reason - What changed (for commit message)
   */
  schedule(reason = 'auto-sync') {
    if (!this.repoUrl) return

    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => this._sync(reason), this.debounceMs)
  }

  /**
   * Force an immediate sync (used at shutdown).
   */
  async flush() {
    if (!this.repoUrl) return
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    await this._sync('flush before shutdown')
  }

  /**
   * Stop the sync timer.
   */
  stop() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  /**
   * Perform git add + commit + push. Silently no-ops if nothing changed.
   * @private
   */
  async _sync(reason) {
    if (this._syncing) return
    this._syncing = true

    try {
      // Check for changes
      const status = await this._git(['status', '--porcelain'])
      if (!status.trim()) {
        this._syncing = false
        return
      }

      await this._git(['add', '-A'])

      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const message = `[kenobot] ${reason} (${timestamp})`

      try {
        await this._git(['commit', '-m', message])
      } catch (error) {
        // Nothing to commit (race condition or .gitignore filtered everything)
        if (error.message.includes('nothing to commit')) {
          this._syncing = false
          return
        }
        throw error
      }

      await this._git(['push', '-u', 'origin', 'main'])

      logger.info('config-sync', 'synced', { reason })
    } catch (error) {
      logger.warn('config-sync', 'sync_failed', { reason, error: error.message })
    } finally {
      this._syncing = false
    }
  }

  /**
   * Ensure homeDir is a git repo.
   * @private
   */
  async _ensureGitRepo() {
    try {
      await access(join(this.homeDir, '.git'))
    } catch {
      await this._git(['init', '-b', 'main'])
      logger.info('config-sync', 'git_init', { dir: this.homeDir })
    }
  }

  /**
   * Ensure the remote 'origin' points to repoUrl.
   * @private
   */
  async _ensureRemote() {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: this.homeDir })
      if (stdout.trim() !== this.repoUrl) {
        await this._git(['remote', 'set-url', 'origin', this.repoUrl])
      }
    } catch {
      await this._git(['remote', 'add', 'origin', this.repoUrl])
    }
  }

  /**
   * Ensure .gitignore exists with sane defaults.
   * @private
   */
  async _ensureGitignore() {
    const gitignorePath = join(this.homeDir, '.gitignore')
    try {
      await access(gitignorePath)
    } catch {
      await writeFile(gitignorePath, GITIGNORE_TEMPLATE, 'utf8')
      logger.info('config-sync', 'gitignore_created')
    }
  }

  /**
   * Ensure git user config is set for commits.
   * @private
   */
  async _ensureGitConfig() {
    try {
      await this._git(['config', 'user.name', 'KenoBot'])
      await this._git(['config', 'user.email', 'kenobot@backup'])
    } catch {
      // Non-critical
    }
  }

  /**
   * Pull latest from remote (fast-forward only). Ignores errors.
   * @private
   */
  async _pull() {
    try {
      await this._git(['fetch', 'origin', 'main'])
      await this._git(['merge', '--ff-only', 'origin/main'])
    } catch {
      // First push hasn't happened yet, or remote is empty — that's fine
    }
  }

  /**
   * Run a git command in the home directory.
   * @private
   */
  async _git(args) {
    const options = { cwd: this.homeDir, timeout: 30000 }
    if (this.sshKeyPath) {
      options.env = {
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i ${this.sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`
      }
    }
    const { stdout, stderr } = await execFileAsync('git', args, options)
    return (stdout + stderr).trim()
  }
}

const GITIGNORE_TEMPLATE = `# Secrets
config/.env
config/*.env

# Runtime data (large, not worth syncing)
data/sessions/
data/logs/
data/scheduler/

# Backups (already archived)
backups/

# OS files
.DS_Store
`
