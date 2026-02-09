import { describe, it, expect, beforeEach } from 'vitest'
import MockProvider from '../../src/providers/mock.js'

describe('MockProvider', () => {
  let provider

  beforeEach(() => {
    provider = new MockProvider({ model: 'sonnet' })
  })

  describe('chat()', () => {
    it('should respond to hello messages with Star Wars greeting', async () => {
      const result = await provider.chat([
        { role: 'user', content: 'hello there' }
      ])

      expect(result.content).toBeDefined()
      expect(result.content).toMatch(/Hello there!/i)
      expect(result.content).toMatch(/General Kenobi/i)
      expect(result.content).toMatch(/mock mode/i)
    })

    it('should respond to help messages', async () => {
      const result = await provider.chat([
        { role: 'user', content: 'help' }
      ])

      expect(result.content).toMatch(/Mock Provider Help/i)
      expect(result.content).toMatch(/May the Force/i)
    })

    it('should echo user message for generic input', async () => {
      const result = await provider.chat([
        { role: 'user', content: 'testing 123' }
      ])

      expect(result.content).toMatch(/You said: "testing 123"/i)
      expect(result.content).toMatch(/message flow is working/i)
    })

    it('should handle empty messages', async () => {
      const result = await provider.chat([
        { role: 'user', content: '' }
      ])

      expect(result.content).toBeDefined()
      expect(result.content).toMatch(/You said: ""/i)
    })

    it('should return usage metadata', async () => {
      const result = await provider.chat([
        { role: 'user', content: 'test' }
      ])

      expect(result.usage).toBeDefined()
      expect(result.usage.mock).toBe(true)
    })

    it('should simulate delay', async () => {
      const start = Date.now()
      await provider.chat([{ role: 'user', content: 'test' }])
      const duration = Date.now() - start

      // Should take at least 30ms (allowing for some timing variance)
      expect(duration).toBeGreaterThanOrEqual(30)
    })
  })

  describe('name', () => {
    it('should return correct provider name', () => {
      expect(provider.name).toBe('mock')
    })
  })
})
