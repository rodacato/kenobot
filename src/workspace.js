import { mkdir, access, readdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import logger from './logger.js'

const execFileAsync = promisify(execFile)

/**
 * Initialize the bot's workspace directory.
 * Creates directory structure and optionally syncs with git remote.
 *
 * Called once at startup from index.js.
 *
 * @param {string} workspaceDir - Absolute path to workspace directory
 * @param {Object} options - Optional configuration
 * @param {string} options.sshKeyPath - Path to SSH key for git operations
 */
export async function initWorkspace(workspaceDir, options = {}) {
  // 1. Ensure directory exists
  await mkdir(workspaceDir, { recursive: true })

  // 2. Create subdirectories
  const subdirs = ['skills', 'workflows', 'notes', 'identity', 'staging/skills', 'staging/workflows', 'staging/identity']
  for (const sub of subdirs) {
    await mkdir(join(workspaceDir, sub), { recursive: true })
  }

  // 3. Check if git repo
  const isGitRepo = await _isGitRepo(workspaceDir)
  if (!isGitRepo) {
    logger.info('workspace', 'no_git_repo', { dir: workspaceDir, hint: 'run git init and add remote to enable sync' })
    return
  }

  // 4. Check for remote
  const hasRemote = await _hasRemote(workspaceDir)
  if (!hasRemote) {
    logger.warn('workspace', 'no_remote', { dir: workspaceDir, hint: 'add a git remote for sync' })
    return
  }

  // 5. Check for uncommitted changes
  const status = await _gitStatus(workspaceDir)
  if (status.length > 0) {
    logger.warn('workspace', 'uncommitted_changes', { dir: workspaceDir, files: status.length })
  }

  // 6. Pull latest (fast-forward only)
  try {
    const pullOptions = { cwd: workspaceDir }
    if (options.sshKeyPath) {
      pullOptions.env = {
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i ${options.sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`
      }
    }
    await execFileAsync('git', ['pull', '--ff-only'], pullOptions)
    logger.info('workspace', 'synced', { dir: workspaceDir })
  } catch (error) {
    logger.warn('workspace', 'pull_failed', { dir: workspaceDir, error: error.message })
  }
}

async function _isGitRepo(dir) {
  try {
    await access(join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

async function _hasRemote(dir) {
  try {
    const { stdout } = await execFileAsync('git', ['remote'], { cwd: dir })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function _gitStatus(dir) {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: dir })
    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}
