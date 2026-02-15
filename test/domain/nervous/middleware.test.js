import { describe, it, expect, vi } from 'vitest'
import Signal from '../../../src/domain/nervous/signal.js'
import {
  createTraceMiddleware,
  createLoggingMiddleware,
  createDeadSignalMiddleware
} from '../../../src/domain/nervous/middleware.js'

describe('createTraceMiddleware', () => {
  it('should store traceId from MESSAGE_IN', () => {
    const mw = createTraceMiddleware()
    const signal = new Signal('message:in', { chatId: '123' }, { source: 'telegram' })

    mw(signal)

    // TraceId stored internally — we verify via MESSAGE_OUT
    const outSignal = new Signal('message:out', { chatId: '123' }, { source: 'agent' })
    mw(outSignal)

    expect(outSignal.traceId).toBe(signal.traceId)
  })

  it('should not affect unrelated chatIds', () => {
    const mw = createTraceMiddleware()

    mw(new Signal('message:in', { chatId: '111' }, { source: 'telegram', traceId: 'trace-111' }))

    const outSignal = new Signal('message:out', { chatId: '999' }, { source: 'agent' })
    const originalTraceId = outSignal.traceId
    mw(outSignal)

    expect(outSignal.traceId).toBe(originalTraceId)
  })

  it('should clean up trace after MESSAGE_OUT', () => {
    const mw = createTraceMiddleware()

    const inSignal = new Signal('message:in', { chatId: '123' }, { source: 'telegram' })
    mw(inSignal)

    // First OUT picks up the trace
    const out1 = new Signal('message:out', { chatId: '123' }, { source: 'agent' })
    mw(out1)
    expect(out1.traceId).toBe(inSignal.traceId)

    // Second OUT for same chatId should NOT pick up (trace was consumed)
    const out2 = new Signal('message:out', { chatId: '123' }, { source: 'agent' })
    const originalTrace = out2.traceId
    mw(out2)
    expect(out2.traceId).toBe(originalTrace)
  })

  it('should handle signals without chatId', () => {
    const mw = createTraceMiddleware()
    const signal = new Signal('error', { source: 'test' })

    // Should not throw
    mw(signal)
  })
})

describe('createLoggingMiddleware', () => {
  it('should log signal type and source', () => {
    const logger = { info: vi.fn() }
    const mw = createLoggingMiddleware(logger)
    const signal = new Signal('message:in', { text: 'hi' }, { source: 'telegram' })

    mw(signal)

    expect(logger.info).toHaveBeenCalledWith('nervous', 'message:in', {
      source: 'telegram',
      traceId: signal.traceId
    })
  })

  it('should skip quiet signal types', () => {
    const logger = { info: vi.fn() }
    const mw = createLoggingMiddleware(logger)
    const signal = new Signal('thinking:start', { chatId: '1' }, { source: 'agent' })

    mw(signal)

    expect(logger.info).not.toHaveBeenCalled()
  })

  it('should allow custom quiet set', () => {
    const logger = { info: vi.fn() }
    const mw = createLoggingMiddleware(logger, { quiet: new Set(['message:in']) })

    mw(new Signal('message:in', {}, { source: 'a' }))
    mw(new Signal('message:out', {}, { source: 'b' }))

    expect(logger.info).toHaveBeenCalledOnce()
    expect(logger.info).toHaveBeenCalledWith('nervous', 'message:out', expect.any(Object))
  })
})

describe('createDeadSignalMiddleware', () => {
  it('should warn when signal has zero listeners', () => {
    const emitter = { listenerCount: vi.fn(() => 0) }
    const logger = { warn: vi.fn() }
    const mw = createDeadSignalMiddleware(emitter, logger)
    const signal = new Signal('config:changed', { reason: 'test' }, { source: 'pp' })

    mw(signal)

    expect(logger.warn).toHaveBeenCalledWith('nervous', 'dead_signal', {
      type: 'config:changed',
      source: 'pp',
      traceId: signal.traceId
    })
  })

  it('should not warn when listeners exist', () => {
    const emitter = { listenerCount: vi.fn(() => 2) }
    const logger = { warn: vi.fn() }
    const mw = createDeadSignalMiddleware(emitter, logger)

    mw(new Signal('message:in', {}, { source: 'test' }))

    expect(logger.warn).not.toHaveBeenCalled()
  })
})
