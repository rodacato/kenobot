import crypto from 'node:crypto'

/**
 * Extract client IP from request.
 * Reads x-forwarded-for (reverse proxy) or socket address.
 *
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
export function extractIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * Validate Bearer token from Authorization header.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {string} apiKey - Expected API key
 * @returns {boolean}
 */
export function validateBearer(req, apiKey) {
  const auth = req.headers['authorization']
  if (!auth) return false

  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return false

  const provided = parts[1]
  if (!provided || !apiKey) return false

  // Ensure equal-length buffers for timingSafeEqual
  // If lengths differ, pad with zeros — comparison will still fail but without timing leak
  const a = Buffer.from(provided)
  const b = Buffer.from(apiKey)

  if (a.length !== b.length) {
    // Compare against a dummy of same length to maintain constant time
    crypto.timingSafeEqual(a, Buffer.alloc(a.length))
    return false
  }

  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Sliding-window rate limiter.
 * Mutates the provided store (Map<ip, timestamps[]>).
 *
 * @param {string} ip
 * @param {number} windowMs - Window size in milliseconds
 * @param {number} limit - Max requests per window
 * @param {Map<string, number[]>} store - Mutable rate limiter state
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
export function checkRateLimit(ip, windowMs, limit, store) {
  const now = Date.now()
  const timestamps = store.get(ip) || []

  // Prune expired entries
  const fresh = timestamps.filter(t => now - t < windowMs)

  if (fresh.length >= limit) {
    const oldest = fresh[0]
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000)
    store.set(ip, fresh)
    return { allowed: false, retryAfter }
  }

  fresh.push(now)
  store.set(ip, fresh)
  return { allowed: true }
}
