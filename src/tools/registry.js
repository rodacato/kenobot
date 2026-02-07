/**
 * ToolRegistry - Manages tool registration and execution
 *
 * Explicit registration (not auto-discovery) because:
 * - Tools need config (n8n needs webhook URL, future tools need API keys)
 * - Can selectively enable/disable tools
 * - No dynamic imports, easier to test
 * - Auto-discovery is trivial to add later if needed
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

  async execute(name, input) {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Unknown tool: ${name}`)
    return await tool.execute(input)
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
