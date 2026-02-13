import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import BootstrapOrchestrator from '../../../src/cognitive/identity/bootstrap-orchestrator.js'

describe('BootstrapOrchestrator', () => {
  let orchestrator

  beforeEach(() => {
    orchestrator = new BootstrapOrchestrator()
  })

  describe('initialization', () => {
    it('should initialize with observing phase', () => {
      const state = orchestrator.initialize()

      expect(state.phase).toBe('observing')
      expect(state.messageCount).toBe(0)
      expect(state.observedProfile).toBeDefined()
    })
  })

  describe('observation phase', () => {
    beforeEach(() => {
      orchestrator.initialize()
    })

    it('should continue observation for first 5 messages', () => {
      for (let i = 1; i <= 5; i++) {
        const result = orchestrator.processMessage('test message')

        expect(result.action).toBe('continue')
        expect(result.phase).toBe('observing')
        expect(orchestrator.messageCount).toBe(i)
      }
    })

    it('should trigger checkpoint at message 6', () => {
      // Process 5 messages
      for (let i = 0; i < 5; i++) {
        orchestrator.processMessage('message')
      }

      // 6th message triggers checkpoint
      const result = orchestrator.processMessage('message 6')

      expect(result.action).toBe('show_checkpoint')
      expect(result.phase).toBe('checkpoint')
      expect(result.checkpointMessage).toBeDefined()
      expect(orchestrator.phase).toBe('checkpoint')
    })

    it('should update observed profile when provided', () => {
      const inferredProfile = {
        tone: 'casual',
        verbosity: 'concise',
        language: 'es'
      }

      orchestrator.processMessage('test', inferredProfile)

      expect(orchestrator.observedProfile.tone).toBe('casual')
      expect(orchestrator.observedProfile.verbosity).toBe('concise')
      expect(orchestrator.observedProfile.language).toBe('es')
    })
  })

  describe('checkpoint phase', () => {
    beforeEach(() => {
      orchestrator.initialize()
      // Skip to checkpoint
      for (let i = 0; i < 6; i++) {
        orchestrator.processMessage('message')
      }
    })

    it('should move to boundaries phase after checkpoint', () => {
      const result = orchestrator.processMessage('Sí, perfecto')

      expect(result.action).toBe('show_boundaries')
      expect(result.phase).toBe('boundaries')
      expect(result.boundariesMessage).toBeDefined()
      expect(orchestrator.phase).toBe('boundaries')
    })

    it('should generate checkpoint message in Spanish by default', () => {
      orchestrator.observedProfile.language = 'es'
      const message = orchestrator._generateCheckpointMessage()

      expect(message).toContain('He notado que')
      expect(message).toContain('¿Voy bien')
    })

    it('should generate checkpoint message in English', () => {
      orchestrator.observedProfile.language = 'en'
      const message = orchestrator._generateCheckpointMessage()

      expect(message).toContain('I\'ve noticed')
      expect(message).toContain('Am I on track')
    })
  })

  describe('boundaries phase', () => {
    beforeEach(() => {
      orchestrator.initialize()
      // Skip to boundaries
      for (let i = 0; i < 6; i++) {
        orchestrator.processMessage('message')
      }
      orchestrator.processMessage('confirm checkpoint')
    })

    it('should complete bootstrap after boundaries', () => {
      const result = orchestrator.processMessage('No borrar archivos')

      expect(result.action).toBe('complete')
      expect(result.phase).toBe('complete')
      expect(result.boundaries).toBe('No borrar archivos')
      expect(orchestrator.confirmedBoundaries).toBe('No borrar archivos')
    })

    it('should generate boundaries message in Spanish', () => {
      orchestrator.observedProfile.language = 'es'
      const message = orchestrator._generateBoundariesMessage()

      expect(message).toContain('Una última cosa')
      expect(message).toContain('líneas rojas')
    })

    it('should generate boundaries message in English', () => {
      orchestrator.observedProfile.language = 'en'
      const message = orchestrator._generateBoundariesMessage()

      expect(message).toContain('One last important thing')
      expect(message).toContain('red lines')
    })
  })

  describe('state management', () => {
    it('should get current state', () => {
      orchestrator.initialize()
      orchestrator.processMessage('test')

      const state = orchestrator.getState()

      expect(state.phase).toBe('observing')
      expect(state.messageCount).toBe(1)
      expect(state.observedProfile).toBeDefined()
    })

    it('should load state', () => {
      const savedState = {
        phase: 'checkpoint',
        messageCount: 6,
        observedProfile: { tone: 'casual', language: 'es' },
        confirmedBoundaries: null
      }

      orchestrator.loadState(savedState)

      expect(orchestrator.phase).toBe('checkpoint')
      expect(orchestrator.messageCount).toBe(6)
      expect(orchestrator.observedProfile.tone).toBe('casual')
    })
  })

  describe('formatPreferences', () => {
    it('should format preferences as markdown', () => {
      orchestrator.initialize()
      orchestrator.observedProfile = {
        tone: 'casual',
        verbosity: 'concise',
        language: 'es',
        emojiUsage: 'occasional',
        techContext: 'Node.js backend'
      }
      orchestrator.confirmedBoundaries = 'No push without asking'

      const formatted = orchestrator.formatPreferences()

      expect(formatted).toContain('# User Preferences')
      expect(formatted).toContain('casual')
      expect(formatted).toContain('concise')
      expect(formatted).toContain('No push without asking')
      expect(formatted).toContain('Node.js backend')
    })
  })

  describe('checkpoint message generation', () => {
    beforeEach(() => {
      orchestrator.observedProfile = {
        tone: 'casual',
        verbosity: 'concise',
        language: 'es',
        emojiUsage: 'frequent',
        techContext: 'Node.js'
      }
    })

    it('should mention emoji usage when frequent', () => {
      const message = orchestrator._generateCheckpointES(orchestrator.observedProfile)

      expect(message).toContain('emojis con frecuencia')
    })

    it('should mention no emojis when none', () => {
      orchestrator.observedProfile.emojiUsage = 'none'
      const message = orchestrator._generateCheckpointES(orchestrator.observedProfile)

      expect(message).toContain('sin emojis')
    })

    it('should mention tech context when available', () => {
      const message = orchestrator._generateCheckpointES(orchestrator.observedProfile)

      expect(message).toContain('Node.js')
    })
  })
})
