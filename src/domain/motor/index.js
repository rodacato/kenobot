import defaultLogger from '../../infrastructure/logger.js'
import { searchWeb, fetchUrl } from './tools.js'

/**
 * ToolRegistry - Catalog of tools the bot can use during conversations.
 *
 * Each tool is a { definition, execute } object:
 *   - definition: Anthropic tool_use format (name, description, input_schema)
 *   - execute(input, opts): async function that performs the action
 */
export class ToolRegistry {
  constructor() {
    this._tools = new Map()
  }

  register(tool) {
    this._tools.set(tool.definition.name, tool)
  }

  getDefinitions() {
    return Array.from(this._tools.values()).map(t => t.definition)
  }

  async executeTool(name, input, { logger = defaultLogger } = {}) {
    const tool = this._tools.get(name)
    if (!tool) {
      return { result: `Unknown tool: ${name}`, isError: true }
    }

    try {
      const result = await tool.execute(input, { logger })
      return { result: typeof result === 'string' ? result : JSON.stringify(result), isError: false }
    } catch (error) {
      return { result: `Tool error: ${error.message}`, isError: true }
    }
  }

  get size() {
    return this._tools.size
  }
}

export function createToolRegistry() {
  const registry = new ToolRegistry()
  registry.register(searchWeb)
  registry.register(fetchUrl)
  return registry
}
