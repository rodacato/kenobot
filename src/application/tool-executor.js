import defaultLogger from '../infrastructure/logger.js'

/**
 * Execute tool calls from an LLM response.
 *
 * @param {Array<{id: string, name: string, input: object}>} toolCalls
 * @param {ToolRegistry} registry
 * @param {object} opts
 * @returns {Promise<Array<{id: string, result: string, isError: boolean}>>}
 */
export async function executeToolCalls(toolCalls, registry, { logger = defaultLogger } = {}) {
  const results = []

  for (const call of toolCalls) {
    logger.info('motor', 'tool_start', { tool: call.name, id: call.id })

    const { result, isError } = await registry.executeTool(call.name, call.input, { logger })

    logger.info('motor', 'tool_complete', {
      tool: call.name,
      id: call.id,
      isError,
      resultLength: result.length
    })

    results.push({ id: call.id, result, isError })
  }

  return results
}
