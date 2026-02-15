import { spawn } from 'node:child_process'
import { access, mkdir, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveWorkspace, sshUrl } from '../../domain/motor/workspace.js'
import { generatePreCommitHook } from '../../domain/immune/secret-scanner.js'
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

/**
 * Install the pre-commit hook in a git repository.
 * Hook is generated from the immune system's secret scanner patterns.
 * @param {string} workDir - Path to the git repository
 */
async function installPreCommitHook(workDir) {
  const hooksDir = join(workDir, '.git', 'hooks')
  await mkdir(hooksDir, { recursive: true })
  const hookPath = join(hooksDir, 'pre-commit')
  await writeFile(hookPath, generatePreCommitHook())
  await chmod(hookPath, 0o755)
}

// --- Tool factory ---

export function createGithubSetupWorkspace(motorConfig) {
  return {
    definition: {
      name: 'github_setup_workspace',
      description: 'Clone a GitHub repository into the workspace via SSH. If already cloned, fetches updates. Installs a pre-commit hook for secret scanning. Use run_command for all other git operations (diff, commit, push, etc.).',
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
      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)
      const url = sshUrl(repo)

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

        // Re-install hook on update (ensures latest patterns)
        await installPreCommitHook(workDir)

        const current = await git(['branch', '--show-current'], workDir)
        return `Updated ${repo} (branch: ${current}). Workspace: ${workDir}`
      }

      // Fresh clone
      const parentDir = workDir.slice(0, workDir.lastIndexOf('/'))
      await mkdir(parentDir, { recursive: true })

      await git(['clone', url, workDir], '/tmp')

      // Configure git user for commits
      const username = motorConfig.githubUsername || 'kenobot'
      await git(['config', 'user.name', username], workDir)
      await git(['config', 'user.email', `${username}@users.noreply.github.com`], workDir)

      // Install pre-commit hook for secret scanning
      await installPreCommitHook(workDir)

      if (branch) {
        await git(['checkout', '-b', branch], workDir)
      }

      const current = await git(['branch', '--show-current'], workDir)
      return `Cloned ${repo} (branch: ${current}). Workspace: ${workDir}`
    }
  }
}

