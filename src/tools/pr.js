import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import BaseTool from './base.js'

const execFileAsync = promisify(execFile)

/**
 * PRTool - Create and manage GitHub Pull Requests
 *
 * Uses GitHub CLI (gh) for PR operations. Requires gh to be installed
 * and authenticated (gh auth login).
 *
 * Slash command: /pr create, /pr list, /pr view
 * LLM tool_use: pr { action: "create", title: "...", body: "...", branch: "..." }
 */
export default class PRTool extends BaseTool {
  constructor(workspaceDir, { sshKeyPath } = {}) {
    super()
    this.cwd = workspaceDir
    this.sshKeyPath = sshKeyPath || ''
  }

  get definition() {
    return {
      name: 'pr',
      description: 'Create and manage GitHub Pull Requests: create, list, view, merge',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'list', 'view', 'merge'],
            description: 'PR operation to perform'
          },
          title: {
            type: 'string',
            description: 'PR title (for create)'
          },
          body: {
            type: 'string',
            description: 'PR body/description (for create)'
          },
          branch: {
            type: 'string',
            description: 'Source branch name (for create, defaults to current branch)'
          },
          base: {
            type: 'string',
            description: 'Target branch (for create, defaults to main/master)'
          },
          number: {
            type: 'number',
            description: 'PR number (for view/merge)'
          },
          draft: {
            type: 'boolean',
            description: 'Create as draft PR (for create)'
          }
        },
        required: ['action']
      }
    }
  }

  get trigger() {
    return /^\/pr\s+(\w+)\s*(.*)/i
  }

  parseTrigger(match) {
    const action = match[1]
    const rest = match[2].trim()

    if (action === 'create') {
      // /pr create "Title" or /pr create (will use commit message)
      return { action, title: rest || undefined }
    }
    if (action === 'view' || action === 'merge') {
      return { action, number: parseInt(rest, 10) || undefined }
    }
    return { action }
  }

  async execute(input) {
    // Check if gh is available
    try {
      await execFileAsync('gh', ['--version'], { timeout: 5000 })
    } catch {
      return 'GitHub CLI (gh) is not installed or not in PATH. Install it: https://cli.github.com/'
    }

    switch (input.action) {
      case 'create':
        return await this._create(input)

      case 'list':
        return await this._run(['pr', 'list', '--limit', '10'])

      case 'view': {
        if (!input.number) {
          // View current branch's PR
          return await this._run(['pr', 'view'])
        }
        return await this._run(['pr', 'view', String(input.number)])
      }

      case 'merge': {
        if (!input.number) throw new Error('number is required for merge')
        return await this._run(['pr', 'merge', String(input.number), '--merge'])
      }

      default:
        throw new Error(`Unknown action: ${input.action}`)
    }
  }

  async _create(input) {
    const args = ['pr', 'create']

    // Title
    if (input.title) {
      args.push('--title', input.title)
    }

    // Body
    if (input.body) {
      args.push('--body', input.body)
    } else {
      args.push('--body', '')
    }

    // Target branch
    if (input.base) {
      args.push('--base', input.base)
    }

    // Draft
    if (input.draft) {
      args.push('--draft')
    }

    try {
      const result = await this._run(args)
      return result
    } catch (error) {
      // Enhance error message
      if (error.message.includes('no commits')) {
        return 'Cannot create PR: no commits between branches. Make sure you have committed and pushed your changes.'
      }
      if (error.message.includes('already exists')) {
        return 'A PR for this branch already exists. Use /pr view to see it.'
      }
      throw error
    }
  }

  async _run(args) {
    try {
      const options = { cwd: this.cwd, timeout: 30000 }
      if (this.sshKeyPath) {
        options.env = {
          ...process.env,
          GIT_SSH_COMMAND: `ssh -i ${this.sshKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`
        }
      }
      const { stdout, stderr } = await execFileAsync('gh', args, options)
      return (stdout + stderr).trim()
    } catch (error) {
      throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${error.message}`)
    }
  }
}

export function register(registry, { config }) {
  // Register if workspace is configured (PR tool works on any git repo)
  if (!config.workspaceDir) return
  registry.register(new PRTool(config.workspaceDir, { sshKeyPath: config.sshKeyPath }))
}
