import { join } from 'node:path'

const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/

/**
 * Validate and parse an owner/repo string.
 * @param {string} repo - "owner/repo" format
 * @returns {{ owner: string, name: string }}
 * @throws {Error} on invalid format
 */
export function parseRepo(repo) {
  if (!repo || !REPO_PATTERN.test(repo)) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`)
  }
  const [owner, name] = repo.split('/')
  return { owner, name }
}

/**
 * Resolve the workspace directory for a repo.
 * @param {string} workspacesDir - Base workspaces directory
 * @param {string} repo - "owner/repo" format
 * @returns {string} Absolute path to workspace
 */
export function resolveWorkspace(workspacesDir, repo) {
  const { owner, name } = parseRepo(repo)
  return join(workspacesDir, owner, name)
}

/**
 * Build the SSH clone URL.
 * @param {string} repo - "owner/repo"
 * @returns {string} SSH URL for git clone
 */
export function sshUrl(repo) {
  parseRepo(repo)
  return `git@github.com:${repo}.git`
}
