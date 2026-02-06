import { spawn } from 'node:child_process'
import BaseProvider from './base.js'

/**
 * ClaudeCLIProvider - Wraps the official Claude Code CLI
 *
 * Pattern from Claudio: wrap the CLI instead of reimplementing.
 * This keeps us ToS-compliant and leverages Anthropic's infrastructure.
 *
 * Uses spawn with stdin ignored — the CLI hangs if stdin is a pipe.
 */
export default class ClaudeCLIProvider extends BaseProvider {
  constructor(config) {
    super()
    this.config = config
  }

  /**
   * Send message to Claude via CLI
   */
  async chat(messages, options = {}) {
    const model = options.model || this.config.model

    // Build prompt from messages
    // For Phase 0, we just use the last user message
    // Phase 1 will add full context building
    const lastMessage = messages[messages.length - 1]
    const prompt = lastMessage?.content || ''

    // Flags aligned with Claudio's approach (github.com/edgarjs/claudio)
    const args = [
      '--dangerously-skip-permissions',
      '--disable-slash-commands',
      '--no-chrome',
      '--no-session-persistence',
      '--permission-mode', 'bypassPermissions',
      '--model', model,
      '-p', prompt
    ]

    try {
      const { stdout, stderr } = await this._spawn('claude', args)

      if (stderr) {
        console.warn('[claude-cli] stderr:', stderr)
      }

      return {
        content: stdout.trim()
      }
    } catch (error) {
      console.error('[claude-cli] Error:', error.message)
      throw new Error(`Claude CLI failed: ${error.message}`)
    }
  }

  /**
   * Spawn claude CLI with stdin closed to prevent hanging.
   * @private
   */
  _spawn(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => { stdout += data })
      child.stderr.on('data', (data) => { stderr += data })

      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error('Claude CLI timed out after 120s'))
      }, 120000)

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`))
        } else {
          resolve({ stdout, stderr })
        }
      })

      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  get name() {
    return 'claude-cli'
  }
}
