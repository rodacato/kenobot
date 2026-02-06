import { describe, it, expect, beforeEach, vi } from 'vitest'
import ToolRegistry from '../../src/tools/registry.js'
import BaseTool from '../../src/tools/base.js'

class FakeTool extends BaseTool {
  constructor(name, result) {
    super()
    this._name = name
    this._result = result
  }

  get definition() {
    return {
      name: this._name,
      description: `Fake ${this._name} tool`,
      input_schema: { type: 'object', properties: {} }
    }
  }

  async execute(input) {
    return this._result
  }
}

describe('ToolRegistry', () => {
  let registry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe('register', () => {
    it('should register a tool by definition name', () => {
      registry.register(new FakeTool('greet', 'hello'))

      expect(registry.has('greet')).toBe(true)
      expect(registry.size).toBe(1)
    })

    it('should register multiple tools', () => {
      registry.register(new FakeTool('greet', 'hello'))
      registry.register(new FakeTool('fetch', 'page content'))

      expect(registry.size).toBe(2)
    })

    it('should overwrite tool with same name', () => {
      registry.register(new FakeTool('greet', 'hello'))
      registry.register(new FakeTool('greet', 'hi'))

      expect(registry.size).toBe(1)
    })
  })

  describe('getDefinitions', () => {
    it('should return empty array when no tools registered', () => {
      expect(registry.getDefinitions()).toEqual([])
    })

    it('should return all tool definitions', () => {
      registry.register(new FakeTool('greet', 'hello'))
      registry.register(new FakeTool('fetch', 'page'))

      const defs = registry.getDefinitions()
      expect(defs).toHaveLength(2)
      expect(defs[0]).toEqual({
        name: 'greet',
        description: 'Fake greet tool',
        input_schema: { type: 'object', properties: {} }
      })
    })
  })

  describe('execute', () => {
    it('should execute a registered tool and return result', async () => {
      registry.register(new FakeTool('greet', 'hello world'))

      const result = await registry.execute('greet', {})
      expect(result).toBe('hello world')
    })

    it('should throw on unknown tool', async () => {
      await expect(registry.execute('unknown', {})).rejects.toThrow('Unknown tool: unknown')
    })
  })

  describe('has', () => {
    it('should return false for unregistered tool', () => {
      expect(registry.has('nope')).toBe(false)
    })
  })

  describe('size', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size).toBe(0)
    })
  })
})

describe('BaseTool', () => {
  it('should throw on unimplemented definition', () => {
    const tool = new BaseTool()
    expect(() => tool.definition).toThrow('definition getter must be implemented')
  })

  it('should throw on unimplemented execute', async () => {
    const tool = new BaseTool()
    await expect(tool.execute({})).rejects.toThrow('execute() must be implemented')
  })
})
