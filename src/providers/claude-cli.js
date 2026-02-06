import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import BaseProvider from './base.js'

const execAsync = promisify(exec)

/**
 * ClaudeCLIProvider - Wraps the official Claude Code CLI
 *
 * Pattern from Claudio: wrap the CLI instead of reimplementing.
 * This keeps us ToS-compliant and leverages Anthropic's infrastructure.
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

    // Escape quotes for shell
    const escapedPrompt = prompt.replace(/"/g, '\\"')

    // Call Claude CLI
    const command = `claude --dangerously-skip-permissions -p "${escapedPrompt}" --model ${model}`

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000, // 2 minutes timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB max output
      })

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

  get name() {
    return 'claude-cli'
  }
}
