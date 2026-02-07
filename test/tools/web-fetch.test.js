import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import WebFetchTool from '../../src/tools/web-fetch.js'

describe('WebFetchTool', () => {
  let tool

  beforeEach(() => {
    tool = new WebFetchTool()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('web_fetch')
    })

    it('should require url parameter', () => {
      expect(tool.definition.input_schema.required).toContain('url')
    })
  })

  describe('trigger', () => {
    it('should match /fetch <url>', () => {
      const match = '/fetch https://example.com'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(tool.parseTrigger(match)).toEqual({ url: 'https://example.com' })
    })

    it('should match /fetch with http URL', () => {
      const match = '/fetch http://test.com/page'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(tool.parseTrigger(match)).toEqual({ url: 'http://test.com/page' })
    })

    it('should not match without URL', () => {
      expect('/fetch'.match(tool.trigger)).toBeNull()
    })

    it('should not match random text', () => {
      expect('fetch something'.match(tool.trigger)).toBeNull()
    })
  })

  describe('execute', () => {
    it('should return text content from HTML page', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html><body><p>Hello world</p></body></html>'
      }))

      const result = await tool.execute({ url: 'https://example.com' })
      expect(result).toContain('Hello world')
      expect(result).not.toContain('<p>')
    })

    it('should strip script and style tags', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => '<html><script>alert("xss")</script><style>.x{}</style><p>Content</p></html>'
      }))

      const result = await tool.execute({ url: 'https://example.com' })
      expect(result).toContain('Content')
      expect(result).not.toContain('alert')
      expect(result).not.toContain('.x{}')
    })

    it('should return JSON content as-is', async () => {
      const json = JSON.stringify({ data: 'test' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        text: async () => json
      }))

      const result = await tool.execute({ url: 'https://api.example.com/data' })
      expect(result).toBe(json)
    })

    it('should truncate content to 10KB', async () => {
      const longText = 'x'.repeat(20_000)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => longText
      }))

      const result = await tool.execute({ url: 'https://example.com/big' })
      expect(result.length).toBe(10_000)
    })

    it('should throw on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      }))

      await expect(tool.execute({ url: 'https://example.com/missing' }))
        .rejects.toThrow('Fetch failed: 404 Not Found')
    })

    it('should pass correct headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'ok'
      })
      vi.stubGlobal('fetch', mockFetch)

      await tool.execute({ url: 'https://example.com' })

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('KenoBot') }),
        redirect: 'follow'
      }))
    })
  })
})
