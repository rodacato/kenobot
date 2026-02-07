import BaseTool from './base.js'

/**
 * DiagnosticsTool - Health check and system diagnostics
 *
 * Reports watchdog status, circuit breaker state, memory usage, uptime.
 * Usable via LLM tool_use or slash command: /diagnostics
 */
export default class DiagnosticsTool extends BaseTool {
  constructor(watchdog, circuitBreaker) {
    super()
    this.watchdog = watchdog
    this.circuitBreaker = circuitBreaker || null
  }

  get definition() {
    return {
      name: 'diagnostics',
      description: 'Get system health status: watchdog state, provider circuit breaker, memory usage, and uptime',
      input_schema: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }

  get trigger() {
    return /^\/diagnostics$/i
  }

  parseTrigger() {
    return {}
  }

  async execute() {
    const status = this.watchdog.getStatus()

    if (this.circuitBreaker) {
      status.circuitBreaker = this.circuitBreaker.getStatus()
    }

    return JSON.stringify(status, null, 2)
  }
}

export function register(registry, { watchdog, circuitBreaker }) {
  registry.register(new DiagnosticsTool(watchdog, circuitBreaker))
}
