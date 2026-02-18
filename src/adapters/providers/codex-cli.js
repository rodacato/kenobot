import { spawn } from 'node:child_process'
import BaseProvider from './base.js'
import { registerProvider } from './registry.js'
import logger from '../../infrastructure/logger.js'

/**
 * CodexCLIProvider - Wraps the OpenAI Codex CLI (@openai/codex)
 *
 * Uses `codex exec` in non-interactive mode with --json for structured output.
 * Requires `codex` installed globally and authenticated (codex login).
 */
export default class CodexCLIProvider extends BaseProvider {
  constructor(config) {
    super()
    this.config = config
  }

  /**
   * Send message to Codex via CLI
   */
  async chat(messages, options = {}) {
    const model = options.model || this.config.model

    const prompt = this._buildPrompt(messages, options)

    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--json',
      '--model', model,
      prompt
    ]

    const cwd = options.cwd || process.env.HOME

    try {
      const { stdout, stderr } = await this._spawn('codex', args, { cwd })

      if (stderr) {
        logger.warn('codex-cli', 'stderr_output', { stderr: stderr.slice(0, 200) })
      }

      return this._parseJsonOutput(stdout)
    } catch (error) {
      logger.error('codex-cli', 'request_failed', { error: error.message })
      throw new Error(`Codex CLI failed: ${error.message}`)
    }
  }

  /**
   * Parse JSONL events from codex exec --json output.
   * Extracts the agent_message content and usage tokens.
   * @private
   */
  _parseJsonOutput(stdout) {
    let content = ''
    let usage = null

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
          content = event.item.text || ''
        }
        if (event.type === 'turn.completed' && event.usage) {
          usage = {
            input_tokens: event.usage.input_tokens || 0,
            output_tokens: event.usage.output_tokens || 0
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return {
      content: content.trim(),
      toolCalls: null,
      stopReason: 'end_turn',
      rawContent: null,
      ...(usage && { usage })
    }
  }

  /**
   * Spawn codex CLI with stdin closed.
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
        reject(new Error('Codex CLI timed out after 120s'))
      }, 120000)

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(`Codex CLI exited with code ${code}: ${stderr}`))
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
      return prompt + (messages[0].content || '')
    }

    for (const msg of messages) {
      const prefix = msg.role === 'user' ? 'Human' : 'Assistant'
      prompt += `${prefix}: ${msg.content}\n\n`
    }

    return prompt.trim()
  }

  get name() {
    return 'codex-cli'
  }
}

registerProvider('codex-cli', (config) => new CodexCLIProvider(config))
