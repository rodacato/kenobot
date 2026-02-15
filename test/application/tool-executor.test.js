import { describe, it, expect, vi } from 'vitest'
import { ToolRegistry } from '../../src/domain/motor/index.js'
import { executeToolCalls } from '../../src/application/tool-executor.js'

vi.mock('../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('executeToolCalls', () => {
  function createRegistry(...tools) {
    const registry = new ToolRegistry()
    for (const tool of tools) registry.register(tool)
    return registry
  }

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

  it('executes each tool call in sequence and returns results array', async () => {
    const echoTool = {
      definition: { name: 'echo', description: 'Echo input', input_schema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] } },
      execute: async ({ msg }) => `echoed: ${msg}`
    }
    const registry = createRegistry(echoTool)

    const toolCalls = [
      { id: 'call_1', name: 'echo', input: { msg: 'first' } },
      { id: 'call_2', name: 'echo', input: { msg: 'second' } }
    ]

    const results = await executeToolCalls(toolCalls, registry, { logger })

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ id: 'call_1', result: 'echoed: first', isError: false })
    expect(results[1]).toEqual({ id: 'call_2', result: 'echoed: second', isError: false })
  })

  it('returns isError: true when tool throws', async () => {
    const failTool = {
      definition: { name: 'fail', description: 'Always fails', input_schema: { type: 'object', properties: {} } },
      execute: async () => { throw new Error('intentional failure') }
    }
    const registry = createRegistry(failTool)

    const toolCalls = [
      { id: 'call_err', name: 'fail', input: {} }
    ]

    const results = await executeToolCalls(toolCalls, registry, { logger })

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('call_err')
    expect(results[0].isError).toBe(true)
    expect(results[0].result).toContain('intentional failure')
  })

  it('handles empty toolCalls array', async () => {
    const registry = createRegistry()

    const results = await executeToolCalls([], registry, { logger })

    expect(results).toEqual([])
  })
})
