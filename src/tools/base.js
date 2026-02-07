/**
 * BaseTool - Interface for agent tools
 *
 * Tools let the agent take actions: fetch URLs, trigger workflows, etc.
 * Each tool provides a definition (for the LLM) and an execute method.
 *
 * Tools can optionally define a trigger (regex) for explicit user invocation
 * via slash commands (e.g. "/fetch https://example.com"). This works with
 * any provider, including claude-cli which can't use native tool calling.
 */
export default class BaseTool {
  /**
   * Tool definition for LLM (Anthropic tool format)
   * @returns {{ name: string, description: string, input_schema: object }}
   */
  get definition() {
    throw new Error('definition getter must be implemented by subclass')
  }

  /**
   * Regex trigger for slash command invocation. Return null to disable.
   * @returns {RegExp|null}
   */
  get trigger() {
    return null
  }

  /**
   * Parse a trigger regex match into tool input.
   * @param {RegExpMatchArray} match - Result of text.match(this.trigger)
   * @returns {object} Input for execute()
   */
  parseTrigger(match) {
    return {}
  }

  /**
   * Execute the tool
   * @param {object} input - Parameters from LLM
   * @returns {Promise<string>} Tool result as text
   */
  async execute(input) {
    throw new Error('execute() must be implemented by subclass')
  }
}
