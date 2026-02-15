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
 * Build the authenticated clone URL.
 * @param {string} repo - "owner/repo"
 * @param {string} token - GitHub PAT (optional)
 * @returns {string} https URL with embedded token
 */
export function cloneUrl(repo, token) {
  parseRepo(repo)
  if (token) {
    return `https://${token}@github.com/${repo}.git`
  }
  return `https://github.com/${repo}.git`
}
