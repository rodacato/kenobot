import { join } from 'node:path'
import ConsciousnessGateway from '../../../src/domain/consciousness/gateway.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const profilesDir = join(import.meta.dirname, '..', '..', '..', 'templates', 'experts')

describe('ConsciousnessGateway', () => {
  let gateway, mockAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    mockAdapter = { call: vi.fn() }
    gateway = new ConsciousnessGateway({
      adapter: mockAdapter,
      profilesDir,
      enabled: true
    })
  })

  describe('profile loading', () => {
    it('loads expert profiles from directory', () => {
      expect(gateway.profiles.size).toBeGreaterThanOrEqual(2)
      expect(gateway.profiles.has('semantic-analyst')).toBe(true)
      expect(gateway.profiles.has('reliability-engineer')).toBe(true)
    })

    it('handles missing profiles directory gracefully', () => {
      const gw = new ConsciousnessGateway({
        adapter: mockAdapter,
        profilesDir: '/nonexistent/path',
        enabled: true
      })
      expect(gw.profiles.size).toBe(0)
    })
  })

  describe('evaluate', () => {
    it('returns parsed JSON on successful call', async () => {
      mockAdapter.call.mockResolvedValue('{"expanded": ["crash", "error", "exception"]}')

      const result = await gateway.evaluate('semantic-analyst', 'expand_keywords', {
        keywords: 'crash',
        chatContext: ''
      })

      expect(result).toEqual({ expanded: ['crash', 'error', 'exception'] })
      expect(mockAdapter.call).toHaveBeenCalledTimes(1)
    })

    it('interpolates template variables in prompt', async () => {
      mockAdapter.call.mockResolvedValue('{"expanded": ["test"]}')

      await gateway.evaluate('semantic-analyst', 'expand_keywords', {
        keywords: 'webhook, auth',
        chatContext: 'Work group'
      })

      const taskPrompt = mockAdapter.call.mock.calls[0][1]
      expect(taskPrompt).toContain('webhook, auth')
      expect(taskPrompt).toContain('Work group')
    })

    it('passes expert systemPrompt as first argument', async () => {
      mockAdapter.call.mockResolvedValue('{"expanded": []}')

      await gateway.evaluate('semantic-analyst', 'expand_keywords', { keywords: 'test', chatContext: '' })

      const systemPrompt = mockAdapter.call.mock.calls[0][0]
      expect(systemPrompt).toContain('semantic analysis')
    })

    it('returns null when disabled', async () => {
      const disabledGw = new ConsciousnessGateway({
        adapter: mockAdapter,
        profilesDir,
        enabled: false
      })

      const result = await disabledGw.evaluate('semantic-analyst', 'expand_keywords', {})
      expect(result).toBeNull()
      expect(mockAdapter.call).not.toHaveBeenCalled()
    })

    it('returns null when adapter is null', async () => {
      const noAdapterGw = new ConsciousnessGateway({
        adapter: null,
        profilesDir,
        enabled: true
      })

      const result = await noAdapterGw.evaluate('semantic-analyst', 'expand_keywords', {})
      expect(result).toBeNull()
    })

    it('returns null for unknown expert', async () => {
      const result = await gateway.evaluate('unknown-expert', 'some_task', {})
      expect(result).toBeNull()
      expect(mockAdapter.call).not.toHaveBeenCalled()
    })

    it('returns null for unknown task', async () => {
      const result = await gateway.evaluate('semantic-analyst', 'unknown_task', {})
      expect(result).toBeNull()
      expect(mockAdapter.call).not.toHaveBeenCalled()
    })

    it('returns null when adapter throws', async () => {
      mockAdapter.call.mockRejectedValue(new Error('CLI not found'))

      const result = await gateway.evaluate('semantic-analyst', 'expand_keywords', {
        keywords: 'test', chatContext: ''
      })
      expect(result).toBeNull()
    })

    it('returns null when adapter returns invalid JSON', async () => {
      mockAdapter.call.mockResolvedValue('this is not json')

      const result = await gateway.evaluate('semantic-analyst', 'expand_keywords', {
        keywords: 'test', chatContext: ''
      })
      expect(result).toBeNull()
    })

    it('strips markdown code fences from response', async () => {
      mockAdapter.call.mockResolvedValue('```json\n{"expanded": ["a", "b"]}\n```')

      const result = await gateway.evaluate('semantic-analyst', 'expand_keywords', {
        keywords: 'test', chatContext: ''
      })
      expect(result).toEqual({ expanded: ['a', 'b'] })
    })

    it('works with reliability-engineer classify_error task', async () => {
      mockAdapter.call.mockResolvedValue('{"category": "external", "confidence": 0.9}')

      const result = await gateway.evaluate('reliability-engineer', 'classify_error', {
        errorMessage: 'ECONNREFUSED 10.0.0.1:5432'
      })

      expect(result).toEqual({ category: 'external', confidence: 0.9 })
    })
  })

  describe('getStats', () => {
    it('returns initial stats with zero counters', () => {
      const stats = gateway.getStats()

      expect(stats.enabled).toBe(true)
      expect(stats.profiles).toContain('semantic-analyst')
      expect(stats.calls).toBe(0)
      expect(stats.successes).toBe(0)
      expect(stats.failures).toBe(0)
      expect(stats.fallbackRate).toBe('0.0')
      expect(stats.avgLatencyMs).toBe(0)
      expect(stats.lastCallAt).toBeNull()
    })

    it('tracks successful calls', async () => {
      mockAdapter.call.mockResolvedValue('{"expanded": ["a"]}')

      await gateway.evaluate('semantic-analyst', 'expand_keywords', { keywords: 'test', chatContext: '' })

      const stats = gateway.getStats()
      expect(stats.calls).toBe(1)
      expect(stats.successes).toBe(1)
      expect(stats.failures).toBe(0)
      expect(stats.fallbackRate).toBe('0.0')
      expect(stats.lastCallAt).toBeGreaterThan(0)
    })

    it('tracks failed calls', async () => {
      mockAdapter.call.mockRejectedValue(new Error('boom'))

      await gateway.evaluate('semantic-analyst', 'expand_keywords', { keywords: 'test', chatContext: '' })

      const stats = gateway.getStats()
      expect(stats.calls).toBe(1)
      expect(stats.successes).toBe(0)
      expect(stats.failures).toBe(1)
      expect(stats.fallbackRate).toBe('100.0')
    })

    it('tracks JSON parse failures', async () => {
      mockAdapter.call.mockResolvedValue('not json')

      await gateway.evaluate('semantic-analyst', 'expand_keywords', { keywords: 'test', chatContext: '' })

      const stats = gateway.getStats()
      expect(stats.calls).toBe(1)
      expect(stats.failures).toBe(1)
    })

    it('calculates average latency', async () => {
      mockAdapter.call.mockResolvedValue('{"expanded": ["a"]}')

      await gateway.evaluate('semantic-analyst', 'expand_keywords', { keywords: 'test', chatContext: '' })
      await gateway.evaluate('semantic-analyst', 'expand_keywords', { keywords: 'test2', chatContext: '' })

      const stats = gateway.getStats()
      expect(stats.calls).toBe(2)
      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0)
    })

    it('reports disabled status', () => {
      const disabledGw = new ConsciousnessGateway({
        adapter: mockAdapter,
        profilesDir,
        enabled: false
      })

      const stats = disabledGw.getStats()
      expect(stats.enabled).toBe(false)
    })
  })
})
