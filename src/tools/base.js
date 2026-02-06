/**
 * BaseTool - Interface for agent tools
 *
 * Tools let the agent take actions: fetch URLs, trigger workflows, etc.
 * Each tool provides a definition (for the LLM) and an execute method.
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
   * Execute the tool
   * @param {object} input - Parameters from LLM
   * @returns {Promise<string>} Tool result as text
   */
  async execute(input) {
    throw new Error('execute() must be implemented by subclass')
  }
}
