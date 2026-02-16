import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import SleepCycle from '../../../../src/domain/cognitive/consolidation/sleep-cycle.js'

/**
 * Create a mock MemorySystem with all methods needed by consolidation components.
 */
function createMockMemory() {
  return {
    getRecentDays: vi.fn().mockResolvedValue(''),
    getChatRecentDays: vi.fn().mockResolvedValue(''),
    getLongTermMemory: vi.fn().mockResolvedValue(''),
    writeLongTermMemory: vi.fn().mockResolvedValue(undefined),
    addFact: vi.fn().mockResolvedValue(undefined),
    getPatterns: vi.fn().mockResolvedValue([]),
    listDailyLogs: vi.fn().mockResolvedValue([]),
    store: {
      listChatSessions: vi.fn().mockResolvedValue([]),
      listWorkingMemorySessions: vi.fn().mockResolvedValue([]),
      deleteWorkingMemory: vi.fn().mockResolvedValue(undefined),
      deleteDailyLog: vi.fn().mockResolvedValue(undefined)
    },
    procedural: {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(true)
    }
  }
}

describe('SleepCycle', () => {
  let sleepCycle
  let mockMemory

  beforeEach(() => {
    mockMemory = createMockMemory()
    sleepCycle = new SleepCycle(mockMemory)
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with idle state', () => {
      const state = sleepCycle.getState()

      expect(state.status).toBe('idle')
      expect(state.lastRun).toBeNull()
      expect(state.currentPhase).toBeNull()
      expect(state.error).toBeNull()
    })

    it('should initialize all consolidation components', () => {
      expect(sleepCycle.consolidator).toBeDefined()
      expect(sleepCycle.errorAnalyzer).toBeDefined()
      expect(sleepCycle.pruner).toBeDefined()
      expect(sleepCycle.selfImprover).toBeDefined()
    })
  })

  describe('run', () => {
    it('should complete all phases successfully', async () => {
      const result = await sleepCycle.run()

      expect(result.success).toBe(true)
      expect(result.phases).toHaveProperty('consolidation')
      expect(result.phases).toHaveProperty('errorAnalysis')
      expect(result.phases).toHaveProperty('pruning')
      expect(result.phases).toHaveProperty('selfImprovement')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('should update state on success', async () => {
      await sleepCycle.run()

      const state = sleepCycle.getState()
      expect(state.status).toBe('success')
      expect(state.lastRun).toBeTruthy()
      expect(state.currentPhase).toBeNull()
      expect(state.error).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      // Force an error by making consolidator throw
      sleepCycle.consolidator.run = vi.fn().mockRejectedValue(new Error('Test error'))

      const result = await sleepCycle.run()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Test error')

      const state = sleepCycle.getState()
      expect(state.status).toBe('failed')
      expect(state.error).toBe('Test error')
    })
  })

  describe('getState', () => {
    it('should return current state', () => {
      const state = sleepCycle.getState()

      expect(state).toHaveProperty('status')
      expect(state).toHaveProperty('lastRun')
      expect(state).toHaveProperty('currentPhase')
      expect(state).toHaveProperty('error')
    })

    it('should return a copy of state', () => {
      const state1 = sleepCycle.getState()
      const state2 = sleepCycle.getState()

      expect(state1).not.toBe(state2)
      expect(state1).toEqual(state2)
    })
  })

  describe('shouldRun', () => {
    it('should return true if never run before', () => {
      expect(sleepCycle.shouldRun()).toBe(true)
    })

    it('should return false if run recently', async () => {
      await sleepCycle.run()

      expect(sleepCycle.shouldRun()).toBe(false)
    })

    it('should return true if enough time has passed', async () => {
      await sleepCycle.run()

      // Manually set lastRun to 21 hours ago
      const twentyOneHoursAgo = new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString()
      sleepCycle.state.lastRun = twentyOneHoursAgo

      expect(sleepCycle.shouldRun()).toBe(true)
    })

    it('should respect custom minHoursBetweenRuns', async () => {
      await sleepCycle.run()

      // Manually set lastRun to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      sleepCycle.state.lastRun = twoHoursAgo

      expect(sleepCycle.shouldRun(1)).toBe(true)
      expect(sleepCycle.shouldRun(3)).toBe(false)
    })
  })
})
