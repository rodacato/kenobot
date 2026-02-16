import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { searchWeb, fetchUrl } from '../../../src/domain/motor/tools.js'

describe('searchWeb', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('definition', () => {
    it('should have correct shape', () => {
      expect(searchWeb.definition.name).toBe('search_web')
      expect(searchWeb.definition.description).toBeTypeOf('string')
      expect(searchWeb.definition.input_schema.type).toBe('object')
      expect(searchWeb.definition.input_schema.properties.query).toBeDefined()
      expect(searchWeb.definition.input_schema.required).toContain('query')
    })
  })

  describe('execute', () => {
    it('should return formatted results from DuckDuckGo API response', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: 'Node.js is a JavaScript runtime',
          AbstractURL: 'https://nodejs.org',
          Answer: '',
          RelatedTopics: [
            { Text: 'Node.js was created by Ryan Dahl' },
            { Text: 'It uses the V8 JavaScript engine' }
          ]
        })
      })

      const result = await searchWeb.execute({ query: 'Node.js' })

      expect(result).toContain('Summary: Node.js is a JavaScript runtime')
      expect(result).toContain('Source: https://nodejs.org')
      expect(result).toContain('- Node.js was created by Ryan Dahl')
      expect(result).toContain('- It uses the V8 JavaScript engine')
    })

    it('should return "No results" when API returns empty data', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: '',
          AbstractURL: '',
          Answer: '',
          RelatedTopics: []
        })
      })

      const result = await searchWeb.execute({ query: 'xyznonexistent' })

      expect(result).toContain('No results found for "xyznonexistent"')
    })

    it('should throw on non-OK HTTP status', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503
      })

      await expect(searchWeb.execute({ query: 'test' }))
        .rejects.toThrow('Search failed: HTTP 503')
    })
  })
})

describe('fetchUrl', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('definition', () => {
    it('should have correct shape', () => {
      expect(fetchUrl.definition.name).toBe('fetch_url')
      expect(fetchUrl.definition.description).toBeTypeOf('string')
      expect(fetchUrl.definition.input_schema.type).toBe('object')
      expect(fetchUrl.definition.input_schema.properties.url).toBeDefined()
      expect(fetchUrl.definition.input_schema.required).toContain('url')
    })
  })

  describe('execute', () => {
    it('should return URL + content-type + body text', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: (h) => h === 'content-type' ? 'text/html; charset=utf-8' : null },
        text: async () => '<h1>Hello World</h1>'
      })

      const result = await fetchUrl.execute({ url: 'https://example.com' })

      expect(result).toContain('URL: https://example.com')
      expect(result).toContain('Content-Type: text/html; charset=utf-8')
      expect(result).toContain('<h1>Hello World</h1>')
    })

    it('should truncate content over 8000 chars', async () => {
      const longContent = 'a'.repeat(9000)

      global.fetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: async () => longContent
      })

      const result = await fetchUrl.execute({ url: 'https://example.com/big' })

      expect(result).toContain('[Content truncated at 8000 characters]')
      expect(result).not.toContain('a'.repeat(9000))
    })

    it('should throw on non-OK HTTP status', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      await expect(fetchUrl.execute({ url: 'https://example.com/missing' }))
        .rejects.toThrow('Fetch failed: HTTP 404 Not Found')
    })
  })
})
