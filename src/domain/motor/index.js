import defaultLogger from '../../infrastructure/logger.js'
import { searchWeb, fetchUrl } from './tools.js'
import { createRunCommand } from '../../adapters/actions/shell.js'
import { createReadFile, createWriteFile, createListFiles } from '../../adapters/actions/file.js'
import { createGitClone, createGitDiff, createGitCommit, createGitPush, createCreatePr } from '../../adapters/actions/github.js'

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

export function createToolRegistry(config = {}) {
  const registry = new ToolRegistry()

  // Information tools (always available)
  registry.register(searchWeb)
  registry.register(fetchUrl)

  // Action tools (require motor config)
  const motor = config.motor
  if (motor) {
    registry.register(createRunCommand(motor))
    registry.register(createReadFile(motor))
    registry.register(createWriteFile(motor))
    registry.register(createListFiles(motor))
    registry.register(createGitClone(motor))
    registry.register(createGitDiff(motor))
    registry.register(createGitCommit(motor))
    registry.register(createGitPush(motor))
    registry.register(createCreatePr(motor))
  }

  return registry
}
