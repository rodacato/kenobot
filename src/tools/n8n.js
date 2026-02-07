import BaseTool from './base.js'

/**
 * N8nTriggerTool - Trigger n8n workflows via webhook
 *
 * Simple HTTP POST to n8n webhook URLs. Requires N8N_WEBHOOK_BASE config.
 */
export default class N8nTriggerTool extends BaseTool {
  constructor(config) {
    super()
    this.webhookBase = config.webhookBase
  }

  get definition() {
    return {
      name: 'n8n_trigger',
      description: 'Trigger an n8n workflow via webhook. Use this to automate tasks like checking calendar, sending emails, or running any configured workflow.',
      input_schema: {
        type: 'object',
        properties: {
          workflow: {
            type: 'string',
            description: 'Workflow name/path (e.g. "daily-summary", "send-email")'
          },
          data: {
            type: 'object',
            description: 'Optional data payload to send to the workflow'
          }
        },
        required: ['workflow']
      }
    }
  }

  async execute({ workflow, data = {} }) {
    const url = `${this.webhookBase}/${workflow}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(30_000)
    })

    if (!response.ok) {
      throw new Error(`n8n webhook failed: ${response.status} ${response.statusText}`)
    }

    const text = await response.text()
    return text || `Workflow "${workflow}" triggered successfully`
  }
}
