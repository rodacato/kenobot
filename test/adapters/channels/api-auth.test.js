import { describe, it, expect, beforeEach, vi } from 'vitest'
import { validateBearer, checkRateLimit, extractIp } from '../../../src/adapters/channels/api-auth.js'

const API_KEY = 'kb-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

function makeReq(headers = {}, socket = {}) {
  return { headers, socket }
}

describe('validateBearer', () => {
  it('returns true for valid key', () => {
    const req = makeReq({ authorization: `Bearer ${API_KEY}` })
    expect(validateBearer(req, API_KEY)).toBe(true)
  })

  it('returns false when Authorization header is missing', () => {
    const req = makeReq({})
    expect(validateBearer(req, API_KEY)).toBe(false)
  })

  it('returns false for wrong scheme (not Bearer)', () => {
    const req = makeReq({ authorization: `Basic ${API_KEY}` })
    expect(validateBearer(req, API_KEY)).toBe(false)
  })

  it('returns false for scheme only (no token)', () => {
    const req = makeReq({ authorization: 'Bearer' })
    expect(validateBearer(req, API_KEY)).toBe(false)
  })

  it('returns false for wrong key', () => {
    const req = makeReq({ authorization: 'Bearer kb-wrongkey12345678901234567890123456789012345678901234567890' })
    expect(validateBearer(req, API_KEY)).toBe(false)
  })

  it('returns false when provided key has different length', () => {
    const req = makeReq({ authorization: 'Bearer kb-short' })
    expect(validateBearer(req, API_KEY)).toBe(false)
  })

  it('returns false when apiKey is empty', () => {
    const req = makeReq({ authorization: `Bearer ${API_KEY}` })
    expect(validateBearer(req, '')).toBe(false)
  })

  it('is case-insensitive for Bearer scheme', () => {
    const req = makeReq({ authorization: `bearer ${API_KEY}` })
    expect(validateBearer(req, API_KEY)).toBe(true)
  })
})

describe('checkRateLimit', () => {
  let store

  beforeEach(() => {
    store = new Map()
  })

  it('allows requests under the limit', () => {
    const result = checkRateLimit('1.2.3.4', 60000, 5, store)
    expect(result.allowed).toBe(true)
  })

  it('allows exactly limit requests', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('1.2.3.4', 60000, 5, store)
    }
    // 5th is the last allowed one — 6th should fail
    const result = checkRateLimit('1.2.3.4', 60000, 5, store)
    expect(result.allowed).toBe(false)
  })

  it('returns retryAfter when rate limited', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('1.2.3.4', 60000, 3, store)
    const result = checkRateLimit('1.2.3.4', 60000, 3, store)
    expect(result.allowed).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(result.retryAfter).toBeLessThanOrEqual(60)
  })

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('1.1.1.1', 60000, 3, store)
    // 1.1.1.1 is at limit
    expect(checkRateLimit('1.1.1.1', 60000, 3, store).allowed).toBe(false)
    // 2.2.2.2 should be fine
    expect(checkRateLimit('2.2.2.2', 60000, 3, store).allowed).toBe(true)
  })

  it('prunes expired timestamps from sliding window', () => {
    // Manually insert an expired entry
    store.set('1.2.3.4', [Date.now() - 61000]) // 61 seconds ago — expired for 60s window
    const result = checkRateLimit('1.2.3.4', 60000, 1, store)
    // The expired entry is pruned, so this is the first request
    expect(result.allowed).toBe(true)
  })
})

describe('extractIp', () => {
  it('reads x-forwarded-for header', () => {
    const req = makeReq({ 'x-forwarded-for': '1.2.3.4' })
    expect(extractIp(req)).toBe('1.2.3.4')
  })

  it('takes first IP from x-forwarded-for chain', () => {
    const req = makeReq({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 172.16.0.1' })
    expect(extractIp(req)).toBe('1.2.3.4')
  })

  it('falls back to socket.remoteAddress', () => {
    const req = makeReq({}, { remoteAddress: '192.168.1.1' })
    expect(extractIp(req)).toBe('192.168.1.1')
  })

  it('returns unknown when no IP available', () => {
    const req = makeReq({}, {})
    expect(extractIp(req)).toBe('unknown')
  })
})
