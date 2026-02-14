import { describe, it, expect } from 'vitest'
import Signal from '../../src/nervous/signal.js'

describe('Signal', () => {
  it('should create a signal with type and payload', () => {
    const signal = new Signal('message:in', { text: 'hello', chatId: '123' })

    expect(signal.type).toBe('message:in')
    expect(signal.payload).toEqual({ text: 'hello', chatId: '123' })
    expect(signal.source).toBe('unknown')
    expect(signal.traceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(signal.timestamp).toBeTypeOf('number')
  })

  it('should accept custom source and traceId', () => {
    const signal = new Signal('message:out', { text: 'hi' }, {
      source: 'agent',
      traceId: 'custom-trace-123'
    })

    expect(signal.source).toBe('agent')
    expect(signal.traceId).toBe('custom-trace-123')
  })

  it('should auto-generate unique traceIds', () => {
    const s1 = new Signal('test', {})
    const s2 = new Signal('test', {})

    expect(s1.traceId).not.toBe(s2.traceId)
  })

  it('should serialize to JSON for audit trail', () => {
    const signal = new Signal('error', { source: 'test', error: 'boom' }, {
      source: 'watchdog',
      traceId: 'trace-abc'
    })

    const json = signal.toJSON()

    expect(json).toEqual({
      type: 'error',
      source: 'watchdog',
      traceId: 'trace-abc',
      timestamp: signal.timestamp,
      payload: { source: 'test', error: 'boom' }
    })
  })

  it('should survive JSON round-trip', () => {
    const signal = new Signal('message:in', { text: 'round trip' }, { source: 'telegram' })
    const serialized = JSON.stringify(signal.toJSON())
    const parsed = JSON.parse(serialized)

    expect(parsed.type).toBe('message:in')
    expect(parsed.payload.text).toBe('round trip')
    expect(parsed.source).toBe('telegram')
    expect(parsed.traceId).toBe(signal.traceId)
  })
})
