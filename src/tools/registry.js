/**
 * ToolRegistry - Manages tool registration and execution
 *
 * Tools self-register via register(registry, deps) exports.
 * ToolLoader auto-discovers src/tools/*.js and calls register().
 * Each tool decides internally whether to register based on deps.
 */
export default class ToolRegistry {
  constructor() {
    this.tools = new Map()
  }

  register(tool) {
    this.tools.set(tool.definition.name, tool)
  }

  getDefinitions() {
    return Array.from(this.tools.values()).map(t => t.definition)
  }

  async execute(name, input, context = {}) {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Unknown tool: ${name}`)
    return await tool.execute(input, context)
  }

  /**
   * Match user text against tool triggers (slash commands).
   * @param {string} text - User message text
   * @returns {{ tool: import('./base.js').default, input: object }|null}
   */
  matchTrigger(text) {
    for (const tool of this.tools.values()) {
      if (!tool.trigger) continue
      const match = text.match(tool.trigger)
      if (match) {
        return { tool, input: tool.parseTrigger(match) }
      }
    }
    return null
  }

  has(name) {
    return this.tools.has(name)
  }

  get size() {
    return this.tools.size
  }
}
