import BaseTool from './base.js'

/**
 * ScheduleTool - Create, list, and remove scheduled tasks
 *
 * Works via tool_use (claude-api) or slash command (any provider):
 *   /schedule add "0 9 * * *" Check your calendar
 *   /schedule list
 *   /schedule remove <id>
 *
 * Requires message context (chatId, userId, channel) to know where
 * to send scheduled messages. Context is passed via execute(input, context).
 */
export default class ScheduleTool extends BaseTool {
  constructor(scheduler) {
    super()
    this.scheduler = scheduler
  }

  /** @returns {RegExp} Matches "/schedule add|list|remove ..." */
  get trigger() {
    return /^\/schedule\s+(add|list|remove)\b(.*)/i
  }

  parseTrigger(match) {
    const action = match[1].toLowerCase()
    const args = match[2]?.trim() || ''

    if (action === 'add') {
      // /schedule add "0 9 * * *" Check your calendar
      const cronMatch = args.match(/^"([^"]+)"\s+(.+)/)
      if (cronMatch) return { action: 'add', cron: cronMatch[1], message: cronMatch[2] }
      return { action: 'add', error: 'Usage: /schedule add "cron-expression" message' }
    }
    if (action === 'remove') return { action: 'remove', id: args }
    return { action: 'list' }
  }

  get definition() {
    return {
      name: 'schedule',
      description: 'Schedule a recurring or one-time task. Use cron expressions like "0 9 * * *" (9am daily), "0 */2 * * *" (every 2h), "30 17 * * 5" (Friday 5:30pm).',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'list', 'remove'],
            description: 'Action to perform'
          },
          cron: {
            type: 'string',
            description: 'Cron expression (required for add)'
          },
          message: {
            type: 'string',
            description: 'Message to send when task fires (required for add)'
          },
          description: {
            type: 'string',
            description: 'Human-readable description of the task'
          },
          id: {
            type: 'string',
            description: 'Task ID (required for remove)'
          }
        },
        required: ['action']
      }
    }
  }

  async execute(input, context = {}) {
    switch (input.action) {
      case 'add': return this._add(input, context)
      case 'list': return this._list()
      case 'remove': return this._remove(input)
      default: return `Unknown action: ${input.action}`
    }
  }

  /** @private */
  async _add({ cron, message, description, error }, context) {
    if (error) return error
    if (!cron || !message) return 'Both cron expression and message are required.'

    const id = await this.scheduler.add({
      cronExpr: cron,
      message,
      description: description || message,
      chatId: context.chatId,
      userId: context.userId,
      channel: context.channel
    })
    return `Task scheduled (ID: ${id.slice(0, 8)}). Cron: ${cron}\nMessage: "${message}"`
  }

  /** @private */
  _list() {
    const tasks = this.scheduler.list()
    if (tasks.length === 0) return 'No scheduled tasks.'
    return tasks.map(t =>
      `- ${t.id.slice(0, 8)}: "${t.description}" (${t.cronExpr})`
    ).join('\n')
  }

  /** @private */
  async _remove({ id }) {
    if (!id) return 'Task ID is required. Use /schedule list to see IDs.'
    // Support short IDs (first 8 chars)
    const fullId = this.scheduler.list().find(t => t.id.startsWith(id))?.id
    if (!fullId) return `Task not found: ${id}`
    await this.scheduler.remove(fullId)
    return `Task ${id} removed.`
  }
}
