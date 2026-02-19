import defaultLogger from '../../infrastructure/logger.js'

const SEARCH_TIMEOUT_MS = 10_000
const FETCH_TIMEOUT_MS = 15_000
const FETCH_MAX_CHARS = 8000

// --- SSRF protection ---

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
]

/**
 * Validate a URL before fetching.
 * Blocks private/internal hosts and non-http(s) schemes.
 * @param {string} rawUrl
 * @throws {Error} if the URL is unsafe
 */
function validateUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Blocked URL scheme: ${parsed.protocol} (only http/https allowed)`)
  }
  const host = parsed.hostname
  if (PRIVATE_HOST_PATTERNS.some(p => p.test(host))) {
    throw new Error(`Blocked private/internal host: ${host}`)
  }
}

// --- Tools ---

export const searchWeb = {
  definition: {
    name: 'search_web',
    description: 'Search the web for current information. Use this when the user asks about something you don\'t know or that might have changed recently.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  },

  async execute({ query }, { logger = defaultLogger } = {}) {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`

    const response = await fetch(url, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'KenoBot/1.0' }
    })

    if (!response.ok) {
      throw new Error(`Search failed: HTTP ${response.status}`)
    }

    const data = await response.json()
    const parts = []

    if (data.AbstractText) {
      parts.push(`Summary: ${data.AbstractText}`)
      if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`)
    }

    if (data.Answer) {
      parts.push(`Answer: ${data.Answer}`)
    }

    if (data.RelatedTopics?.length) {
      const topics = data.RelatedTopics
        .filter(t => t.Text)
        .slice(0, 5)
        .map(t => `- ${t.Text}`)
      if (topics.length) {
        parts.push(`Related:\n${topics.join('\n')}`)
      }
    }

    if (parts.length === 0) {
      return `No results found for "${query}". Try a different search query.`
    }

    return parts.join('\n\n')
  }
}

export const fetchUrl = {
  definition: {
    name: 'fetch_url',
    description: 'Fetch the content of a URL and return it as text. Use this to read web pages, documentation, or API responses.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' }
      },
      required: ['url']
    }
  },

  async execute({ url }, { logger = defaultLogger } = {}) {
    validateUrl(url)

    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'KenoBot/1.0' }
    })

    if (!response.ok) {
      throw new Error(`Fetch failed: HTTP ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    let text = await response.text()

    if (text.length > FETCH_MAX_CHARS) {
      text = text.slice(0, FETCH_MAX_CHARS) + `\n\n[Content truncated at ${FETCH_MAX_CHARS} characters]`
    }

    return `URL: ${url}\nContent-Type: ${contentType}\n\n${text}`
  }
}
