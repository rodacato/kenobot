import { spawn } from 'node:child_process'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * CLI adapter for the consciousness layer.
 *
 * Wraps any CLI that accepts a prompt and returns text (gemini, claude, etc.).
 * NOT a provider — simpler contract: call(systemPrompt, taskPrompt) → string.
 * Spawn pattern from src/adapters/providers/gemini-cli.js.
 */
export default class CLIConsciousnessAdapter {
  constructor({ command = 'gemini', model = 'gemini-2.0-flash', timeout = 30000, logger = defaultLogger } = {}) {
    this.command = command
    this.model = model
    this.timeout = timeout
    this.logger = logger
  }

  /**
   * Execute a one-shot consciousness call.
   * @param {string} systemPrompt - Expert profile system prompt
   * @param {string} taskPrompt - The task/question to evaluate
   * @returns {Promise<string>} Raw text response
   */
  async call(systemPrompt, taskPrompt) {
    const prompt = systemPrompt + '\n\n---\n\n' + taskPrompt

    const args = [
      '--model', this.model,
      '--output-format', 'text',
      '--approval-mode', 'yolo',
      '-p', prompt
    ]

    const { stdout, stderr } = await this._spawn(this.command, args)

    if (stderr) {
      this.logger.warn('consciousness', 'cli_stderr', { stderr: stderr.slice(0, 200) })
    }

    return stdout.trim()
  }

  /**
   * Spawn CLI with stdin closed.
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

      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`Consciousness CLI timed out after ${this.timeout}ms`))
      }, this.timeout)

      child.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(new Error(`Consciousness CLI exited with code ${code}: ${stderr}`))
        } else {
          resolve({ stdout, stderr })
        }
      })

      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }
}
