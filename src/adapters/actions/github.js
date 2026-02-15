import { spawn } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { resolveWorkspace, cloneUrl, parseRepo } from '../../domain/motor/workspace.js'
import defaultLogger from '../../infrastructure/logger.js'

const GIT_TIMEOUT = 120_000

// --- Helpers ---

/**
 * Run a git command and return stdout.
 * @param {string[]} args - git subcommand and arguments
 * @param {string} cwd - working directory
 * @param {number} timeout - timeout in ms
 * @returns {Promise<string>} stdout trimmed
 */
function git(args, cwd, timeout = GIT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`git ${args[0]} timed out after ${timeout}ms`))
    }, timeout)

    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`git ${args[0]} failed (exit ${code}): ${stderr.trim()}`))
      } else {
        resolve(stdout.trim())
      }
    })

    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function dirExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Secret patterns for pre-commit scanning
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Token', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/ },
  { name: 'GitHub PAT', pattern: /github_pat_[A-Za-z0-9_]{22,}/ },
  { name: 'Private Key', pattern: /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)?\s*PRIVATE KEY-----/ },
  { name: 'Generic Secret', pattern: /(?:secret|password|token|key)\s*[:=]\s*['"][A-Za-z0-9+/=]{32,}['"]/i },
]

function scanSecrets(diff) {
  const found = []
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(diff)) {
      found.push(name)
    }
  }
  return found
}

// --- Tool factories ---

export function createGitClone(motorConfig) {
  return {
    definition: {
      name: 'git_clone',
      description: 'Clone a GitHub repository into the workspace. If already cloned, fetches updates. Optionally creates or checks out a branch.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' },
          branch: { type: 'string', description: 'Branch to create or checkout (optional)' }
        },
        required: ['repo']
      }
    },

    async execute({ repo, branch }, { logger = defaultLogger } = {}) {
      if (!motorConfig.githubToken) {
        throw new Error('GITHUB_TOKEN not configured. Set it in .env to use GitHub tools.')
      }

      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)
      const url = cloneUrl(repo, motorConfig.githubToken)

      if (await dirExists(workDir + '/.git')) {
        await git(['fetch', '--all', '--prune'], workDir)

        if (branch) {
          try {
            await git(['checkout', branch], workDir)
            await git(['pull', '--ff-only'], workDir)
          } catch {
            await git(['checkout', '-b', branch], workDir)
          }
        } else {
          await git(['pull', '--ff-only'], workDir)
        }

        const current = await git(['branch', '--show-current'], workDir)
        return `Updated ${repo} (branch: ${current})`
      }

      // Fresh clone
      const parentDir = workDir.slice(0, workDir.lastIndexOf('/'))
      await mkdir(parentDir, { recursive: true })

      await git(['clone', url, workDir], '/tmp')

      // Configure git user for commits
      const username = motorConfig.githubUsername || 'kenobot'
      await git(['config', 'user.name', username], workDir)
      await git(['config', 'user.email', `${username}@users.noreply.github.com`], workDir)

      if (branch) {
        await git(['checkout', '-b', branch], workDir)
      }

      const current = await git(['branch', '--show-current'], workDir)
      return `Cloned ${repo} (branch: ${current})`
    }
  }
}

export function createGitDiff(motorConfig) {
  return {
    definition: {
      name: 'git_diff',
      description: 'Show the current changes in a cloned repository workspace. Returns git status and diff output.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' }
        },
        required: ['repo']
      }
    },

    async execute({ repo }, { logger = defaultLogger } = {}) {
      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)

      const status = await git(['status', '--short'], workDir)
      const diff = await git(['diff'], workDir)
      const staged = await git(['diff', '--cached'], workDir)

      const parts = []
      if (status) parts.push(`Status:\n${status}`)
      if (staged) parts.push(`Staged changes:\n${staged}`)
      if (diff) parts.push(`Unstaged changes:\n${diff}`)
      if (parts.length === 0) parts.push('No changes detected.')

      return parts.join('\n\n')
    }
  }
}

export function createGitCommit(motorConfig) {
  return {
    definition: {
      name: 'git_commit',
      description: 'Stage all changes and create a git commit in a cloned repository workspace. Includes basic secret scanning to prevent accidental credential leaks.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' },
          message: { type: 'string', description: 'Commit message' }
        },
        required: ['repo', 'message']
      }
    },

    async execute({ repo, message }, { logger = defaultLogger } = {}) {
      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)

      await git(['add', '-A'], workDir)

      // Secret scanning on staged diff
      const stagedDiff = await git(['diff', '--cached'], workDir)
      const secrets = scanSecrets(stagedDiff)
      if (secrets.length > 0) {
        await git(['reset', 'HEAD'], workDir)
        throw new Error(`Secret scan failed. Potential secrets found: ${secrets.join(', ')}. Review and remove sensitive data before committing.`)
      }

      await git(['commit', '-m', message], workDir)

      const log = await git(['log', '--oneline', '-1'], workDir)
      return `Committed: ${log}`
    }
  }
}

export function createGitPush(motorConfig) {
  return {
    definition: {
      name: 'git_push',
      description: 'Push the current branch to the remote repository.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' }
        },
        required: ['repo']
      }
    },

    async execute({ repo }, { logger = defaultLogger } = {}) {
      if (!motorConfig.githubToken) {
        throw new Error('GITHUB_TOKEN not configured. Set it in .env to push to GitHub.')
      }

      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)
      const branch = await git(['branch', '--show-current'], workDir)

      if (!branch) {
        throw new Error('Not on a branch (detached HEAD). Checkout a branch first.')
      }

      await git(['push', '-u', 'origin', branch], workDir)
      return `Pushed branch "${branch}" to origin.`
    }
  }
}

export function createCreatePr(motorConfig) {
  return {
    definition: {
      name: 'create_pr',
      description: 'Create a pull request on GitHub via the API.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' },
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR description (markdown)' },
          branch: { type: 'string', description: 'Head branch name' },
          base: { type: 'string', description: 'Base branch (default: "main")' }
        },
        required: ['repo', 'title', 'branch']
      }
    },

    async execute({ repo, title, body = '', branch, base = 'main' }, { logger = defaultLogger } = {}) {
      if (!motorConfig.githubToken) {
        throw new Error('GITHUB_TOKEN not configured. Set it in .env to create pull requests.')
      }

      parseRepo(repo)

      const response = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${motorConfig.githubToken}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'KenoBot/1.0'
        },
        body: JSON.stringify({ title, body, head: branch, base }),
        signal: AbortSignal.timeout(30_000)
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(`GitHub API error (${response.status}): ${error.message || response.statusText}`)
      }

      const pr = await response.json()
      return `PR #${pr.number} created: ${pr.html_url}`
    }
  }
}

// Export git helper for testing
export { git as _git }
