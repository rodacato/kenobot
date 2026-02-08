import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import WebFetchTool, { getBlockedReason } from '../../src/tools/web-fetch.js'

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

  describe('getBlockedReason', () => {
    it('should block localhost', () => {
      expect(getBlockedReason('http://localhost:6379')).toBe('loopback address')
      expect(getBlockedReason('http://localhost/admin')).toBe('loopback address')
    })

    it('should block 127.0.0.1', () => {
      expect(getBlockedReason('http://127.0.0.1:5000')).toBe('loopback address')
      expect(getBlockedReason('http://127.0.0.1')).toBe('loopback address')
      expect(getBlockedReason('http://127.0.0.2')).toBe('loopback address')
    })

    it('should block IPv6 loopback', () => {
      expect(getBlockedReason('http://[::1]:8080')).toBe('loopback address')
    })

    it('should block 10.x.x.x (RFC-1918)', () => {
      expect(getBlockedReason('http://10.0.0.1')).toBe('private range (10.x)')
      expect(getBlockedReason('http://10.255.255.255')).toBe('private range (10.x)')
    })

    it('should block 172.16-31.x.x (RFC-1918)', () => {
      expect(getBlockedReason('http://172.16.0.1')).toBe('private range (172.16-31.x)')
      expect(getBlockedReason('http://172.31.255.255')).toBe('private range (172.16-31.x)')
    })

    it('should not block 172.15.x or 172.32.x', () => {
      expect(getBlockedReason('http://172.15.0.1')).toBeNull()
      expect(getBlockedReason('http://172.32.0.1')).toBeNull()
    })

    it('should block 192.168.x.x (RFC-1918)', () => {
      expect(getBlockedReason('http://192.168.1.1')).toBe('private range (192.168.x)')
      expect(getBlockedReason('http://192.168.0.100')).toBe('private range (192.168.x)')
    })

    it('should block 169.254.x.x (link-local / AWS metadata)', () => {
      expect(getBlockedReason('http://169.254.169.254/latest/meta-data/')).toBe('link-local address')
      expect(getBlockedReason('http://169.254.0.1')).toBe('link-local address')
    })

    it('should block 0.0.0.0', () => {
      expect(getBlockedReason('http://0.0.0.0')).toBe('internal address')
    })

    it('should block metadata.google.internal', () => {
      expect(getBlockedReason('http://metadata.google.internal/computeMetadata/v1/')).toBe('internal address')
    })

    it('should allow public URLs', () => {
      expect(getBlockedReason('https://example.com')).toBeNull()
      expect(getBlockedReason('https://api.github.com/repos')).toBeNull()
      expect(getBlockedReason('http://8.8.8.8')).toBeNull()
      expect(getBlockedReason('https://httpbin.org/get')).toBeNull()
    })

    it('should reject invalid URLs', () => {
      expect(getBlockedReason('not-a-url')).toBe('invalid URL')
      expect(getBlockedReason('')).toBe('invalid URL')
    })
  })

  describe('execute', () => {
    it('should return text content from HTML page', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
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
        status: 200,
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
        status: 200,
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
        status: 200,
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

    it('should use manual redirect mode', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'ok'
      })
      vi.stubGlobal('fetch', mockFetch)

      await tool.execute({ url: 'https://example.com' })

      expect(mockFetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('KenoBot') }),
        redirect: 'manual'
      }))
    })

    it('should block private URLs', async () => {
      await expect(tool.execute({ url: 'http://127.0.0.1:6379' }))
        .rejects.toThrow('URL blocked: loopback address')
    })

    it('should block AWS metadata URL', async () => {
      await expect(tool.execute({ url: 'http://169.254.169.254/latest/meta-data/' }))
        .rejects.toThrow('URL blocked: link-local address')
    })

    it('should follow safe redirects', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Map([['location', 'https://example.com/new']]),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'text/plain']]),
          text: async () => 'redirected content'
        })
      vi.stubGlobal('fetch', mockFetch)

      const result = await tool.execute({ url: 'https://example.com/old' })
      expect(result).toBe('redirected content')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should block redirects to private IPs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: new Map([['location', 'http://127.0.0.1:8080/admin']]),
      }))

      await expect(tool.execute({ url: 'https://evil.com/redirect' }))
        .rejects.toThrow('Redirect blocked: loopback address')
    })

    it('should reject too many redirects', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Map([['location', 'https://example.com/hop1']]),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Map([['location', 'https://example.com/hop2']]),
        })
      vi.stubGlobal('fetch', mockFetch)

      await expect(tool.execute({ url: 'https://example.com/start' }))
        .rejects.toThrow('Too many redirects')
    })
  })
})
