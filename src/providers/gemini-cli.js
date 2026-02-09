import { spawn } from 'node:child_process'
import BaseProvider from './base.js'
import { registerProvider } from './registry.js'
import logger from '../logger.js'

/**
 * GeminiCLIProvider - Wraps the Google Gemini CLI (@google/gemini-cli)
 *
 * Pattern mirrors ClaudeCLIProvider: wrap the CLI instead of reimplementing.
 * Uses spawn with stdin ignored for consistency with claude-cli approach.
 */
export default class GeminiCLIProvider extends BaseProvider {
  constructor(config) {
    super()
    this.config = config
  }

  /**
   * Send message to Gemini via CLI
   */
  async chat(messages, options = {}) {
    const model = options.model || this.config.model

    // Build prompt from system context + message history
    const prompt = this._buildPrompt(messages, options)

    const args = [
      '--model', model,
      '--output-format', 'text',
      '--approval-mode', 'yolo',
      '-p', prompt
    ]

    const cwd = options.cwd || process.env.HOME

    try {
      const { stdout, stderr } = await this._spawn('gemini', args, { cwd })

      if (stderr) {
        logger.warn('gemini-cli', 'stderr_output', { stderr: stderr.slice(0, 200) })
      }

      return {
        content: stdout.trim(),
        toolCalls: null,
        stopReason: 'end_turn',
        rawContent: null
      }
    } catch (error) {
      logger.error('gemini-cli', 'request_failed', { error: error.message })
      throw new Error(`Gemini CLI failed: ${error.message}`)
    }
  }

  /**
   * Spawn gemini CLI with stdin closed.
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
        reject(new Error('Gemini CLI timed out after 120s'))
      }, 120000)

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(`Gemini CLI exited with code ${code}: ${stderr}`))
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
    return 'gemini-cli'
  }
}

registerProvider('gemini-cli', (config) => new GeminiCLIProvider(config))
