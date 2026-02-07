import { describe, it, expect, vi } from 'vitest'
import DiagnosticsTool from '../../src/tools/diagnostics.js'

describe('DiagnosticsTool', () => {
  const mockWatchdog = {
    getStatus: vi.fn().mockImplementation(() => ({
      state: 'HEALTHY',
      uptime: 3600,
      memory: { rss: 120, heap: 80 },
      checks: {
        provider: { status: 'ok', detail: '0 failures', critical: true, lastCheck: Date.now() },
        memory: { status: 'ok', detail: '120MB RSS', critical: false, lastCheck: Date.now() }
      }
    }))
  }

  const mockCircuitBreaker = {
    getStatus: vi.fn().mockReturnValue({
      state: 'CLOSED',
      failures: 0,
      threshold: 5,
      provider: 'claude-api'
    })
  }

  it('should have correct definition', () => {
    const tool = new DiagnosticsTool(mockWatchdog)
    const def = tool.definition

    expect(def.name).toBe('diagnostics')
    expect(def.description).toBeTruthy()
    expect(def.input_schema).toBeDefined()
  })

  it('should have /diagnostics trigger', () => {
    const tool = new DiagnosticsTool(mockWatchdog)

    expect(tool.trigger.test('/diagnostics')).toBe(true)
    expect(tool.trigger.test('/DIAGNOSTICS')).toBe(true)
    expect(tool.trigger.test('/diagnostics extra')).toBe(false)
    expect(tool.trigger.test('diagnostics')).toBe(false)
  })

  it('should return watchdog status as JSON', async () => {
    const tool = new DiagnosticsTool(mockWatchdog)

    const result = await tool.execute()
    const parsed = JSON.parse(result)

    expect(parsed.state).toBe('HEALTHY')
    expect(parsed.uptime).toBe(3600)
    expect(parsed.checks.provider.status).toBe('ok')
  })

  it('should include circuit breaker status when available', async () => {
    const tool = new DiagnosticsTool(mockWatchdog, mockCircuitBreaker)

    const result = await tool.execute()
    const parsed = JSON.parse(result)

    expect(parsed.circuitBreaker).toBeDefined()
    expect(parsed.circuitBreaker.state).toBe('CLOSED')
    expect(parsed.circuitBreaker.provider).toBe('claude-api')
  })

  it('should work without circuit breaker', async () => {
    const tool = new DiagnosticsTool(mockWatchdog)

    const result = await tool.execute()
    const parsed = JSON.parse(result)

    expect(parsed.circuitBreaker).toBeUndefined()
  })

  it('should return empty object from parseTrigger', () => {
    const tool = new DiagnosticsTool(mockWatchdog)
    expect(tool.parseTrigger()).toEqual({})
  })
})
