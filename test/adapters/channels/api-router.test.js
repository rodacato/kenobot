import { describe, it, expect, vi } from 'vitest'
import { createRouter, pathToRegex } from '../../../src/adapters/channels/api-router.js'

describe('pathToRegex', () => {
  it('converts exact path to regex', () => {
    const re = pathToRegex('/api/v1/health')
    expect(re.test('/api/v1/health')).toBe(true)
    expect(re.test('/api/v1/healthz')).toBe(false)
    expect(re.test('/api/v1')).toBe(false)
  })

  it('converts :param to named capture group', () => {
    const re = pathToRegex('/api/v1/conversations/:id')
    const match = re.exec('/api/v1/conversations/abc-123')
    expect(match).not.toBeNull()
    expect(match.groups.id).toBe('abc-123')
  })

  it('converts multiple :params', () => {
    const re = pathToRegex('/api/v1/things/:type/:id')
    const match = re.exec('/api/v1/things/memory/abc')
    expect(match.groups.type).toBe('memory')
    expect(match.groups.id).toBe('abc')
  })

  it('does not match across path segments', () => {
    const re = pathToRegex('/api/v1/conversations/:id')
    // :id should not match 'abc/extra'
    expect(re.test('/api/v1/conversations/abc/extra')).toBe(false)
  })
})

describe('createRouter', () => {
  const handler1 = vi.fn()
  const handler2 = vi.fn()
  const handler3 = vi.fn()

  const routes = [
    { method: 'GET', pattern: pathToRegex('/api/v1/'), handler: handler1 },
    { method: 'GET', pattern: pathToRegex('/api/v1/conversations/:id'), handler: handler2 },
    { method: 'POST', pattern: pathToRegex('/api/v1/conversations/:id/messages'), handler: handler3 },
    { method: '*', pattern: pathToRegex('/api/v1/health'), handler: handler1 },
  ]

  const router = createRouter(routes)

  it('matches exact path and method', () => {
    const result = router('GET', '/api/v1/')
    expect(result).not.toBeNull()
    expect(result.handler).toBe(handler1)
    expect(result.params).toEqual({})
  })

  it('extracts named params', () => {
    const result = router('GET', '/api/v1/conversations/my-conv-id')
    expect(result).not.toBeNull()
    expect(result.handler).toBe(handler2)
    expect(result.params.id).toBe('my-conv-id')
  })

  it('matches POST with nested path', () => {
    const result = router('POST', '/api/v1/conversations/conv123/messages')
    expect(result).not.toBeNull()
    expect(result.handler).toBe(handler3)
    expect(result.params.id).toBe('conv123')
  })

  it('returns null on method mismatch', () => {
    const result = router('DELETE', '/api/v1/')
    expect(result).toBeNull()
  })

  it('returns null for unknown path', () => {
    const result = router('GET', '/api/v1/unknown')
    expect(result).toBeNull()
  })

  it('wildcard method * matches any method', () => {
    expect(router('GET', '/api/v1/health')).not.toBeNull()
    expect(router('POST', '/api/v1/health')).not.toBeNull()
    expect(router('DELETE', '/api/v1/health')).not.toBeNull()
  })

  it('respects route order (first match wins)', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    const r = createRouter([
      { method: 'GET', pattern: pathToRegex('/api/v1/stats'), handler: h1 },
      { method: 'GET', pattern: pathToRegex('/api/v1/stats'), handler: h2 },
    ])
    const result = r('GET', '/api/v1/stats')
    expect(result.handler).toBe(h1)
  })
})
