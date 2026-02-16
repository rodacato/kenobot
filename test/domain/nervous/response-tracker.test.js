import { describe, it, expect } from 'vitest'
import ResponseTracker from '../../../src/domain/nervous/response-tracker.js'

describe('ResponseTracker', () => {
  it('should start with empty stats', () => {
    const tracker = new ResponseTracker()
    const stats = tracker.getStats()

    expect(stats.total).toBe(0)
    expect(stats.errors).toBe(0)
    expect(stats.recent).toBe(0)
    expect(stats.avgMs).toBe(0)
    expect(stats.maxMs).toBe(0)
    expect(stats.p95Ms).toBe(0)
    expect(stats.errorRate).toBe('0.0')
  })

  it('should record successful responses', () => {
    const tracker = new ResponseTracker()
    tracker.record({ durationMs: 100 })
    tracker.record({ durationMs: 200 })
    tracker.record({ durationMs: 300 })

    const stats = tracker.getStats()
    expect(stats.total).toBe(3)
    expect(stats.errors).toBe(0)
    expect(stats.recent).toBe(3)
    expect(stats.avgMs).toBe(200)
    expect(stats.maxMs).toBe(300)
    expect(stats.errorRate).toBe('0.0')
  })

  it('should record errors', () => {
    const tracker = new ResponseTracker()
    tracker.record({ durationMs: 100 })
    tracker.record({ durationMs: 200, error: true })

    const stats = tracker.getStats()
    expect(stats.total).toBe(2)
    expect(stats.errors).toBe(1)
    expect(stats.errorRate).toBe('50.0')
  })

  it('should track tool iterations', () => {
    const tracker = new ResponseTracker()
    tracker.record({ durationMs: 100, toolIterations: 3 })

    // Tool iterations are stored in buffer entries
    expect(tracker._buffer[0].toolIterations).toBe(3)
  })

  it('should respect capacity limit (ring buffer)', () => {
    const tracker = new ResponseTracker({ capacity: 3 })

    tracker.record({ durationMs: 100 })
    tracker.record({ durationMs: 200 })
    tracker.record({ durationMs: 300 })
    tracker.record({ durationMs: 400 }) // should evict 100

    const stats = tracker.getStats()
    expect(stats.total).toBe(4)    // totals keep counting
    expect(stats.recent).toBe(3)   // buffer limited to 3
    expect(stats.avgMs).toBe(300)  // avg of 200, 300, 400
    expect(stats.maxMs).toBe(400)
  })

  it('should calculate p95 correctly', () => {
    const tracker = new ResponseTracker()

    // Add 100 responses with values 10, 20, ..., 1000
    for (let i = 1; i <= 100; i++) {
      tracker.record({ durationMs: i * 10 })
    }

    const stats = tracker.getStats()
    // p95 of [10..1000]: ceil(0.95 * 100) - 1 = index 94 → value 950
    expect(stats.p95Ms).toBe(950)
  })

  it('should handle single entry', () => {
    const tracker = new ResponseTracker()
    tracker.record({ durationMs: 500 })

    const stats = tracker.getStats()
    expect(stats.avgMs).toBe(500)
    expect(stats.maxMs).toBe(500)
    expect(stats.p95Ms).toBe(500)
  })

  it('should include timestamps in buffer entries', () => {
    const tracker = new ResponseTracker()
    const before = Date.now()
    tracker.record({ durationMs: 100 })
    const after = Date.now()

    expect(tracker._buffer[0].timestamp).toBeGreaterThanOrEqual(before)
    expect(tracker._buffer[0].timestamp).toBeLessThanOrEqual(after)
  })

  it('should keep totals accurate after overflow', () => {
    const tracker = new ResponseTracker({ capacity: 2 })

    tracker.record({ durationMs: 100, error: true })
    tracker.record({ durationMs: 200 })
    tracker.record({ durationMs: 300 })

    const stats = tracker.getStats()
    expect(stats.total).toBe(3)
    expect(stats.errors).toBe(1)
    // Recent only has last 2 entries (200, 300)
    expect(stats.recent).toBe(2)
    expect(stats.avgMs).toBe(250)
  })
})
