import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../../../src/infrastructure/logger.js'
import BaseProvider from '../../../src/adapters/providers/base.js'

describe('BaseProvider interface contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should have supportsTools default to false', () => {
    const base = new BaseProvider()
    expect(base.supportsTools).toBe(false)
  })

  it('should throw when chat() is not overridden', async () => {
    const base = new BaseProvider()
    await expect(base.chat([], {})).rejects.toThrow('chat() must be implemented')
  })

  it('should throw when name getter is not overridden', () => {
    const base = new BaseProvider()
    expect(() => base.name).toThrow('name getter must be implemented')
  })

  it('should warn when subclass does not implement chat()', () => {
    class EmptyProvider extends BaseProvider {
      get name() { return 'empty' }
    }
    new EmptyProvider()

    expect(logger.warn).toHaveBeenCalledWith('provider', 'missing_method', {
      provider: 'EmptyProvider',
      method: 'chat'
    })
  })

  it('should warn when subclass does not implement name getter', () => {
    class NoNameProvider extends BaseProvider {
      async chat() { return { content: 'x' } }
    }
    new NoNameProvider()

    expect(logger.warn).toHaveBeenCalledWith('provider', 'missing_getter', {
      provider: 'NoNameProvider',
      getter: 'name'
    })
  })

  it('should not warn when subclass implements all required methods', () => {
    class CompleteProvider extends BaseProvider {
      async chat() { return { content: 'hi' } }
      get name() { return 'complete' }
    }
    new CompleteProvider()

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('should allow subclass to override supportsTools', () => {
    class ToolProvider extends BaseProvider {
      async chat() { return { content: 'hi' } }
      get name() { return 'tool-provider' }
      get supportsTools() { return true }
    }
    const p = new ToolProvider()
    expect(p.supportsTools).toBe(true)
  })

  it('should provide default adaptToolDefinitions (pass-through)', () => {
    const base = new BaseProvider()
    const defs = [{ name: 'web_fetch', description: 'Fetch URL' }]
    expect(base.adaptToolDefinitions(defs)).toBe(defs)
  })

  it('should provide default buildToolResultMessages', () => {
    const base = new BaseProvider()
    const rawContent = [{ type: 'tool_use', id: 't1' }]
    const results = [{ id: 't1', result: 'ok', isError: false }]
    const messages = base.buildToolResultMessages(rawContent, results)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'assistant', content: rawContent })
    expect(messages[1].role).toBe('user')
    expect(messages[1].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 't1',
      content: 'ok',
      is_error: false
    })
  })
})
