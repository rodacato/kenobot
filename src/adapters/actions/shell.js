import { spawn } from 'node:child_process'
import { resolveWorkspace } from '../../domain/motor/workspace.js'
import defaultLogger from '../../infrastructure/logger.js'

const MAX_TIMEOUT = 300_000

/**
 * Create the run_command tool.
 * @param {Object} motorConfig - motor section of config
 */
export function createRunCommand(motorConfig) {
  return {
    definition: {
      name: 'run_command',
      description: 'Execute a shell command in a cloned repository workspace. Use for running tests, linting, building, or any CLI operation. The command runs with stdin closed, no sudo, and a timeout. Output is capped.',
      input_schema: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Repository in "owner/repo" format' },
          command: { type: 'string', description: 'Shell command to execute (e.g. "npm test", "ls -la")' },
          timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default: 60000, max: 300000)' }
        },
        required: ['repo', 'command']
      }
    },

    async execute({ repo, command, timeout_ms }, { logger = defaultLogger } = {}) {
      const workDir = resolveWorkspace(motorConfig.workspacesDir, repo)
      const timeout = Math.min(timeout_ms || motorConfig.shellTimeout || 60_000, MAX_TIMEOUT)
      const maxOutput = motorConfig.shellMaxOutput || 102_400

      if (/\bsudo\b/.test(command)) {
        throw new Error('sudo is not allowed')
      }

      logger.info('motor', 'shell_start', { repo, command: command.slice(0, 100), timeout })

      return new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', command], {
          cwd: workDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, HOME: workDir }
        })

        let stdout = ''
        let stderr = ''
        let killed = false

        child.stdout.on('data', (data) => {
          stdout += data
          if (stdout.length > maxOutput) {
            stdout = stdout.slice(0, maxOutput)
            child.kill()
            killed = true
          }
        })

        child.stderr.on('data', (data) => {
          stderr += data
          if (stderr.length > maxOutput) {
            stderr = stderr.slice(0, maxOutput)
          }
        })

        const timer = setTimeout(() => {
          child.kill()
          killed = true
          reject(new Error(`Command timed out after ${timeout}ms`))
        }, timeout)

        child.on('close', (code) => {
          clearTimeout(timer)
          let output = ''
          if (stdout) output += stdout
          if (stderr) output += (output ? '\n--- stderr ---\n' : '') + stderr
          if (killed && code !== null) {
            output += `\n[Output truncated at ${maxOutput} bytes]`
          }
          output += `\n[Exit code: ${code}]`
          resolve(output)
        })

        child.on('error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
      })
    }
  }
}
