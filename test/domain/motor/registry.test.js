import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { ToolRegistry, createToolRegistry } from '../../../src/domain/motor/index.js'

function makeTool(name, result) {
  return {
    definition: { name, description: `Test tool: ${name}`, input_schema: { type: 'object' } },
    execute: vi.fn().mockResolvedValue(result)
  }
}

describe('ToolRegistry', () => {
  describe('register + getDefinitions', () => {
    it('should return registered tool definitions', () => {
      const registry = new ToolRegistry()
      const tool = makeTool('greet', 'hello')

      registry.register(tool)

      const defs = registry.getDefinitions()
      expect(defs).toHaveLength(1)
      expect(defs[0].name).toBe('greet')
      expect(defs[0].description).toBe('Test tool: greet')
    })
  })

  describe('executeTool', () => {
    it('should call the right tool and return { result, isError: false }', async () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('echo', 'pong'))

      const outcome = await registry.executeTool('echo', { text: 'ping' })

      expect(outcome).toEqual({ result: 'pong', isError: false })
    })

    it('should return isError: true for unknown tool', async () => {
      const registry = new ToolRegistry()

      const outcome = await registry.executeTool('nonexistent', {})

      expect(outcome).toEqual({ result: 'Unknown tool: nonexistent', isError: true })
    })

    it('should wrap thrown errors in { result, isError: true }', async () => {
      const registry = new ToolRegistry()
      const tool = {
        definition: { name: 'boom', description: 'explodes', input_schema: { type: 'object' } },
        execute: vi.fn().mockRejectedValue(new Error('kaboom'))
      }
      registry.register(tool)

      const outcome = await registry.executeTool('boom', {})

      expect(outcome).toEqual({ result: 'Tool error: kaboom', isError: true })
    })

    it('should stringify non-string results', async () => {
      const registry = new ToolRegistry()
      registry.register(makeTool('data', { count: 42 }))

      const outcome = await registry.executeTool('data', {})

      expect(outcome.result).toBe('{"count":42}')
      expect(outcome.isError).toBe(false)
    })
  })
})

describe('createToolRegistry', () => {
  it('should return a registry with search_web and fetch_url tools', () => {
    const registry = createToolRegistry()

    expect(registry.size).toBe(2)

    const names = registry.getDefinitions().map(d => d.name)
    expect(names).toContain('search_web')
    expect(names).toContain('fetch_url')
  })
})
