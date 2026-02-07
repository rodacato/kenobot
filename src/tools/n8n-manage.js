import BaseTool from './base.js'

/**
 * N8nManageTool - Manage n8n workflows via REST API
 *
 * Extends n8n integration beyond triggering webhooks. Allows the bot
 * to list, inspect, create, activate, and deactivate workflows.
 *
 * Slash commands:
 *   /n8n-manage list
 *   /n8n-manage get <id>
 *   /n8n-manage activate <id>
 *   /n8n-manage deactivate <id>
 *
 * LLM tool_use:
 *   n8n_manage { action: "list" }
 *   n8n_manage { action: "create", name: "...", nodes: [...], connections: {...} }
 */
export default class N8nManageTool extends BaseTool {
  constructor(config) {
    super()
    this.apiUrl = config.n8nApiUrl
    this.apiKey = config.n8nApiKey
  }

  get definition() {
    return {
      name: 'n8n_manage',
      description: 'Manage n8n workflows: list, get details, create, activate, or deactivate workflows via the n8n REST API.',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'get', 'create', 'activate', 'deactivate'],
            description: 'Action to perform'
          },
          id: {
            type: 'string',
            description: 'Workflow ID (required for get/activate/deactivate)'
          },
          name: {
            type: 'string',
            description: 'Workflow name (required for create)'
          },
          nodes: {
            type: 'array',
            description: 'Workflow nodes array (required for create)'
          },
          connections: {
            type: 'object',
            description: 'Workflow connections object (required for create)'
          }
        },
        required: ['action']
      }
    }
  }

  get trigger() {
    return /^\/n8n-manage\s+(\w+)\s*(.*)/i
  }

  parseTrigger(match) {
    const action = match[1].toLowerCase()
    const arg = match[2]?.trim() || ''
    if (action === 'get' || action === 'activate' || action === 'deactivate') {
      return { action, id: arg }
    }
    return { action }
  }

  async execute(input) {
    switch (input.action) {
      case 'list': return this._list()
      case 'get': return this._get(input.id)
      case 'create': return this._create(input)
      case 'activate': return this._setActive(input.id, true)
      case 'deactivate': return this._setActive(input.id, false)
      default: throw new Error(`Unknown action: ${input.action}`)
    }
  }

  async _list() {
    const data = await this._api('GET', '/workflows')
    const workflows = data.data || data
    if (!Array.isArray(workflows) || workflows.length === 0) return 'No workflows found.'
    return workflows.map(w =>
      `- ${w.id}: ${w.name} (${w.active ? 'active' : 'inactive'})`
    ).join('\n')
  }

  async _get(id) {
    if (!id) throw new Error('id is required')
    const w = await this._api('GET', `/workflows/${id}`)
    return JSON.stringify({
      id: w.id,
      name: w.name,
      active: w.active,
      nodes: w.nodes?.length || 0,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }, null, 2)
  }

  async _create({ name, nodes, connections }) {
    if (!name) throw new Error('name is required for create')
    const body = {
      name,
      nodes: nodes || [],
      connections: connections || {},
      settings: {}
    }
    const w = await this._api('POST', '/workflows', body)
    return `Workflow created: ${w.name} (ID: ${w.id})`
  }

  async _setActive(id, active) {
    if (!id) throw new Error('id is required')
    const endpoint = active ? `/workflows/${id}/activate` : `/workflows/${id}/deactivate`
    const w = await this._api('PATCH', endpoint)
    return `Workflow ${id}: ${w.active ? 'activated' : 'deactivated'}`
  }

  async _api(method, path, body) {
    const url = `${this.apiUrl}/api/v1${path}`
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': this.apiKey
      },
      signal: AbortSignal.timeout(15_000)
    }
    if (body) options.body = JSON.stringify(body)

    const response = await fetch(url, options)
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`n8n API error: ${response.status} ${response.statusText} — ${text}`)
    }
    return response.json()
  }
}
