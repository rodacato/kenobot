import BaseTool from './base.js'

/**
 * WebFetchTool - Fetch a URL and return text content
 *
 * Uses global fetch (Node 22+). Basic HTML stripping, no dependencies.
 * 10KB limit prevents context overflow from large pages.
 */
export default class WebFetchTool extends BaseTool {
  /** @returns {RegExp} Matches "/fetch <url>" */
  get trigger() {
    return /^\/fetch\s+(https?:\/\/\S+)/i
  }

  parseTrigger(match) {
    return { url: match[1] }
  }

  get definition() {
    return {
      name: 'web_fetch',
      description: 'Fetch a web page and return its text content. Use this to read articles, documentation, or any public URL.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch'
          }
        },
        required: ['url']
      }
    }
  }

  async execute({ url }) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KenoBot/1.0 (personal assistant)',
        'Accept': 'text/html, text/plain, application/json'
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow'
    })

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    if (contentType.includes('application/json')) {
      return text.slice(0, 10_000)
    }

    // Strip HTML tags for basic text extraction
    const cleaned = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return cleaned.slice(0, 10_000)
  }
}
