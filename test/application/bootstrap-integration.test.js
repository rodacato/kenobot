import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ContextBuilder from '../../src/application/context.js'

describe('Bootstrap integration', () => {
  let contextBuilder
  let mockStorage
  let mockCognitive

  beforeEach(() => {
    mockStorage = {
      loadSession: vi.fn().mockResolvedValue([]),
      saveSession: vi.fn().mockResolvedValue(undefined)
    }

    mockCognitive = {
      getMemorySystem: vi.fn().mockReturnValue(null),
      getIdentityManager: vi.fn().mockReturnValue({
        buildContext: vi.fn().mockResolvedValue({
          core: '# KenoBot',
          behavioralRules: '',
          preferences: '',
          bootstrap: '# Bootstrap instructions\nObserve the user...',
          isBootstrapping: true
        })
      }),
      buildContext: vi.fn().mockResolvedValue({
        memory: { longTerm: '', recentNotes: '', chatLongTerm: '', chatRecent: '' },
        workingMemory: null,
        isBootstrapping: true
      }),
      processBootstrapIfActive: vi.fn().mockResolvedValue(null)
    }

    contextBuilder = new ContextBuilder({}, mockStorage, mockCognitive)
  })

  describe('ContextBuilder._formatBootstrapAction', () => {
    it('should return null for null action', () => {
      expect(contextBuilder._formatBootstrapAction(null)).toBeNull()
    })

    it('should return null for continue action', () => {
      expect(contextBuilder._formatBootstrapAction({ action: 'continue' })).toBeNull()
    })

    it('should format checkpoint action', () => {
      const result = contextBuilder._formatBootstrapAction({
        action: 'show_checkpoint',
        checkpointMessage: 'Hey, I noticed you prefer concise responses.'
      })

      expect(result).toContain('Bootstrap Action — Checkpoint')
      expect(result).toContain('Hey, I noticed you prefer concise responses.')
      expect(result).toContain('naturally')
    })

    it('should format boundaries action', () => {
      const result = contextBuilder._formatBootstrapAction({
        action: 'show_boundaries',
        boundariesMessage: 'What are your red lines?'
      })

      expect(result).toContain('Bootstrap Action — Boundaries')
      expect(result).toContain('What are your red lines?')
      expect(result).toContain('operational limits')
    })

    it('should format complete action', () => {
      const result = contextBuilder._formatBootstrapAction({
        action: 'complete'
      })

      expect(result).toContain('Bootstrap Action — Complete')
      expect(result).toContain('<bootstrap-complete/>')
      expect(result).toContain('preferences have been saved')
    })
  })

  describe('ContextBuilder.build with bootstrapAction', () => {
    it('should inject checkpoint message into system prompt', async () => {
      const bootstrapAction = {
        phase: 'checkpoint',
        action: 'show_checkpoint',
        checkpointMessage: 'You prefer short responses ✅'
      }

      const { system } = await contextBuilder.build('test-session', { text: 'hi' }, {
        bootstrapAction,
        history: []
      })

      expect(system).toContain('# KenoBot')
      expect(system).toContain('Bootstrap instructions')
      expect(system).toContain('Bootstrap Action — Checkpoint')
      expect(system).toContain('You prefer short responses ✅')
    })

    it('should inject boundaries message into system prompt', async () => {
      const bootstrapAction = {
        phase: 'boundaries',
        action: 'show_boundaries',
        boundariesMessage: '¿Cuáles son tus líneas rojas?'
      }

      const { system } = await contextBuilder.build('test-session', { text: 'hi' }, {
        bootstrapAction,
        history: []
      })

      expect(system).toContain('Bootstrap Action — Boundaries')
      expect(system).toContain('¿Cuáles son tus líneas rojas?')
    })

    it('should inject complete message into system prompt', async () => {
      const bootstrapAction = {
        phase: 'complete',
        action: 'complete'
      }

      const { system } = await contextBuilder.build('test-session', { text: 'hi' }, {
        bootstrapAction,
        history: []
      })

      expect(system).toContain('Bootstrap Action — Complete')
      expect(system).toContain('<bootstrap-complete/>')
    })

    it('should not inject anything for continue action', async () => {
      const bootstrapAction = {
        phase: 'observing',
        action: 'continue'
      }

      const { system } = await contextBuilder.build('test-session', { text: 'hi' }, {
        bootstrapAction,
        history: []
      })

      expect(system).toContain('Bootstrap instructions')
      expect(system).not.toContain('Bootstrap Action')
    })

    it('should not inject anything when bootstrapAction is null', async () => {
      const { system } = await contextBuilder.build('test-session', { text: 'hi' }, {
        bootstrapAction: null,
        history: []
      })

      expect(system).toContain('Bootstrap instructions')
      expect(system).not.toContain('Bootstrap Action')
    })

    it('should use pre-loaded history instead of loading from storage', async () => {
      const preloadedHistory = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ]

      const { messages } = await contextBuilder.build('test-session', { text: 'new message' }, {
        history: preloadedHistory
      })

      // Pre-loaded history + current message
      expect(messages).toHaveLength(3)
      expect(messages[0].content).toBe('hello')
      expect(messages[2].content).toBe('new message')
      // Storage should not have been called
      expect(mockStorage.loadSession).not.toHaveBeenCalled()
    })

    it('should fall back to loading from storage when history not provided', async () => {
      mockStorage.loadSession.mockResolvedValue([
        { role: 'user', content: 'stored msg', timestamp: 1 }
      ])

      const { messages } = await contextBuilder.build('test-session', { text: 'new' })

      expect(mockStorage.loadSession).toHaveBeenCalled()
      expect(messages).toHaveLength(2) // stored + current
    })
  })

  describe('Bootstrap action not injected in normal mode', () => {
    it('should not inject bootstrap action when not bootstrapping', async () => {
      // Override to normal mode
      mockCognitive.getIdentityManager.mockReturnValue({
        buildContext: vi.fn().mockResolvedValue({
          core: '# KenoBot',
          behavioralRules: '',
          preferences: '# Preferences\n- tone: casual',
          bootstrap: null,
          isBootstrapping: false
        })
      })

      const bootstrapAction = {
        phase: 'checkpoint',
        action: 'show_checkpoint',
        checkpointMessage: 'Should not appear'
      }

      const { system } = await contextBuilder.build('test-session', { text: 'hi' }, {
        bootstrapAction,
        history: []
      })

      expect(system).not.toContain('Bootstrap Action')
      expect(system).not.toContain('Should not appear')
      expect(system).toContain('Preferences')
    })
  })
})
