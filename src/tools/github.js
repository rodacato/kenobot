import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import BaseTool from './base.js'

const execFileAsync = promisify(execFile)

/**
 * GitHubTool - Git operations scoped to the bot's workspace
 *
 * All operations run in the workspace directory via cwd.
 * Uses execFile (not exec) to prevent shell injection.
 * No --force, no branch delete, no reset — safe by design.
 *
 * Slash command: /git status, /git push, /git log
 * LLM tool_use: github { action: "commit", files: ["path"], message: "..." }
 */
export default class GitHubTool extends BaseTool {
  constructor(workspaceDir) {
    super()
    this.cwd = workspaceDir
  }

  get definition() {
    return {
      name: 'github',
      description: 'Git operations in your workspace: status, commit, push, pull, log',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'commit', 'push', 'pull', 'log'],
            description: 'Git operation to perform'
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to stage (for commit)'
          },
          message: {
            type: 'string',
            description: 'Commit message (for commit)'
          }
        },
        required: ['action']
      }
    }
  }

  get trigger() {
    return /^\/git\s+(\w+)\s*(.*)/i
  }

  parseTrigger(match) {
    const action = match[1]
    const rest = match[2].trim()

    if (action === 'commit') {
      return { action, message: rest || 'auto-commit', files: ['.'] }
    }
    return { action }
  }

  async execute(input) {
    switch (input.action) {
      case 'status':
        return await this._run(['status', '--short']) || '(clean)'

      case 'commit': {
        if (!input.message) throw new Error('message is required for commit')
        const files = input.files || ['.']
        await this._run(['add', ...files])
        return await this._run(['commit', '-m', input.message])
      }

      case 'push':
        return await this._run(['push'])

      case 'pull':
        return await this._run(['pull', '--ff-only'])

      case 'log':
        return await this._run(['log', '--oneline', '-10'])

      default:
        throw new Error(`Unknown action: ${input.action}`)
    }
  }

  async _run(args) {
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: this.cwd,
        timeout: 30000
      })
      return (stdout + stderr).trim()
    } catch (error) {
      throw new Error(`git ${args[0]} failed: ${error.message}`)
    }
  }
}
