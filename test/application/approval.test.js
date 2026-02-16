import { describe, it, expect, beforeEach, vi } from 'vitest'
import NervousSystem from '../../src/domain/nervous/index.js'
import {
  NOTIFICATION, APPROVAL_PROPOSED, APPROVAL_APPROVED, APPROVAL_REJECTED
} from '../../src/infrastructure/events.js'
import { setupNotifications } from '../../src/infrastructure/notifications.js'

vi.mock('../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('Approval workflow', () => {
  let bus
  let config

  beforeEach(() => {
    bus = new NervousSystem({})
    config = {
      telegram: {
        allowedUsers: ['123456'],
        allowedChatIds: []
      }
    }
    setupNotifications(bus, config)
  })

  describe('approval:proposed → notification', () => {
    it('should notify owner when proposal is fired with PR URL', () => {
      const notifications = []
      bus.on(NOTIFICATION, (payload) => notifications.push(payload))

      bus.fire(APPROVAL_PROPOSED, {
        type: 'self-improvement',
        proposalCount: 3,
        prUrl: 'https://github.com/owner/repo/pull/42'
      }, { source: 'cognitive' })

      expect(notifications.length).toBe(1)
      expect(notifications[0].chatId).toBe('123456')
      expect(notifications[0].text).toContain('self-improvement')
      expect(notifications[0].text).toContain('3 items')
      expect(notifications[0].text).toContain('https://github.com/owner/repo/pull/42')
      expect(notifications[0].text).toContain('Review on GitHub')
    })

    it('should notify owner when proposal has no PR URL', () => {
      const notifications = []
      bus.on(NOTIFICATION, (payload) => notifications.push(payload))

      bus.fire(APPROVAL_PROPOSED, {
        type: 'self-improvement',
        proposalCount: 1,
        prUrl: null
      }, { source: 'cognitive' })

      expect(notifications.length).toBe(1)
      expect(notifications[0].text).toContain('self-improvement')
      expect(notifications[0].text).not.toContain('null')
    })
  })

  describe('approval:approved → notification', () => {
    it('should notify owner when proposal is approved', () => {
      const notifications = []
      bus.on(NOTIFICATION, (payload) => notifications.push(payload))

      bus.fire(APPROVAL_APPROVED, {
        type: 'self-improvement',
        prUrl: 'https://github.com/owner/repo/pull/42'
      })

      expect(notifications.length).toBe(1)
      expect(notifications[0].text).toContain('Approved')
      expect(notifications[0].text).toContain('self-improvement')
      expect(notifications[0].text).toContain('https://github.com/owner/repo/pull/42')
    })
  })

  describe('approval:rejected → notification', () => {
    it('should notify owner when proposal is rejected', () => {
      const notifications = []
      bus.on(NOTIFICATION, (payload) => notifications.push(payload))

      bus.fire(APPROVAL_REJECTED, {
        type: 'self-improvement',
        prUrl: 'https://github.com/owner/repo/pull/42'
      })

      expect(notifications.length).toBe(1)
      expect(notifications[0].text).toContain('Rejected')
      expect(notifications[0].text).toContain('self-improvement')
    })
  })

  describe('no owner configured', () => {
    it('should not fire notifications when no owner chat is available', () => {
      const emptyBus = new NervousSystem({})
      setupNotifications(emptyBus, { telegram: { allowedUsers: [], allowedChatIds: [] } })

      const notifications = []
      emptyBus.on(NOTIFICATION, (payload) => notifications.push(payload))

      emptyBus.fire(APPROVAL_PROPOSED, {
        type: 'self-improvement',
        proposalCount: 1,
        prUrl: null
      })

      expect(notifications.length).toBe(0)
    })
  })

  describe('audit trail logging', () => {
    it('should log approval signals to audit trail via NervousSystem', () => {
      // NervousSystem automatically logs all fired signals to audit trail
      bus.fire(APPROVAL_PROPOSED, { type: 'self-improvement', proposalCount: 1, prUrl: null })
      bus.fire(APPROVAL_APPROVED, { type: 'self-improvement', prUrl: null })
      bus.fire(APPROVAL_REJECTED, { type: 'self-improvement', prUrl: null })

      const stats = bus.getStats()
      expect(stats.fired).toBeGreaterThanOrEqual(3)
      // Each approval signal was fired (+ notification signals they trigger)
      expect(stats.byType[APPROVAL_PROPOSED]).toBe(1)
      expect(stats.byType[APPROVAL_APPROVED]).toBe(1)
      expect(stats.byType[APPROVAL_REJECTED]).toBe(1)
    })
  })
})
