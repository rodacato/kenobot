import { spawn } from 'node:child_process'
import BaseProvider from './base.js'
import logger from '../logger.js'

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

    // Build prompt from system context + message history
    const prompt = this._buildPrompt(messages, options)

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

    // CWD: dev mode passes explicit cwd, assistant mode defaults to $HOME
    const cwd = options.cwd || process.env.HOME

    try {
      const { stdout, stderr } = await this._spawn('claude', args, { cwd })

      if (stderr) {
        logger.warn('claude-cli', 'stderr_output', { stderr: stderr.slice(0, 200) })
      }

      return {
        content: stdout.trim(),
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null
      }
    } catch (error) {
      logger.error('claude-cli', 'request_failed', { error: error.message })
      throw new Error(`Claude CLI failed: ${error.message}`)
    }
  }

  /**
   * Spawn claude CLI with stdin closed to prevent hanging.
   * @param {string} command
   * @param {string[]} args
   * @param {{ cwd?: string }} options
   * @private
   */
  _spawn(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: options.cwd || undefined
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

  /**
   * Build a single prompt string from system context + messages.
   * @private
   */
  _buildPrompt(messages, options = {}) {
    let prompt = ''

    if (options.system) {
      prompt += options.system + '\n\n---\n\n'
    }

    if (messages.length === 1) {
      // Single message — no need for role prefixes
      return prompt + (messages[0].content || '')
    }

    for (const msg of messages) {
      const prefix = msg.role === 'user' ? 'Human' : 'Assistant'
      prompt += `${prefix}: ${msg.content}\n\n`
    }

    return prompt.trim()
  }

  get name() {
    return 'claude-cli'
  }
}
