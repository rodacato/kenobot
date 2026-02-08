import BaseTool from './base.js'

/**
 * Check if a URL targets a private/internal network address.
 * Blocks SSRF attacks against localhost, link-local, and RFC-1918 ranges.
 * @param {string} url
 * @returns {string|null} Reason string if blocked, null if allowed
 */
export function getBlockedReason(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return 'invalid URL'
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
    return 'loopback address'
  }

  // Block common private/internal hostnames
  if (hostname === '0.0.0.0' || hostname === 'metadata.google.internal') {
    return 'internal address'
  }

  // Check numeric IPv4
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)

    // 10.0.0.0/8
    if (a === 10) return 'private range (10.x)'
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return 'private range (172.16-31.x)'
    // 192.168.0.0/16
    if (a === 192 && b === 168) return 'private range (192.168.x)'
    // 169.254.0.0/16 (link-local / AWS metadata)
    if (a === 169 && b === 254) return 'link-local address'
    // 127.0.0.0/8
    if (a === 127) return 'loopback address'
    // 0.0.0.0/8
    if (a === 0) return 'invalid address'
  }

  return null
}

/**
 * WebFetchTool - Fetch a URL and return text content
 *
 * Uses global fetch (Node 22+). Basic HTML stripping, no dependencies.
 * 10KB limit prevents context overflow from large pages.
 * SSRF protection: blocks private/internal IP ranges before fetching.
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
    // SSRF protection: block private/internal addresses
    const blocked = getBlockedReason(url)
    if (blocked) {
      throw new Error(`URL blocked: ${blocked}`)
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'KenoBot/1.0 (personal assistant)',
        'Accept': 'text/html, text/plain, application/json'
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual'
    })

    // Manual redirect handling (max 3 hops) to prevent redirect-to-internal
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Redirect without Location header')

      const redirectBlocked = getBlockedReason(new URL(location, url).href)
      if (redirectBlocked) throw new Error(`Redirect blocked: ${redirectBlocked}`)

      // Follow one redirect (recursive call would allow chaining — use fetch directly)
      const redirectResponse = await fetch(location, {
        headers: {
          'User-Agent': 'KenoBot/1.0 (personal assistant)',
          'Accept': 'text/html, text/plain, application/json'
        },
        signal: AbortSignal.timeout(15_000),
        redirect: 'manual'
      })

      if ([301, 302, 303, 307, 308].includes(redirectResponse.status)) {
        throw new Error('Too many redirects (max 2)')
      }

      return this._extractContent(redirectResponse)
    }

    return this._extractContent(response)
  }

  /** @private Extract and clean content from a response */
  async _extractContent(response) {
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

export function register(registry) {
  registry.register(new WebFetchTool())
}
