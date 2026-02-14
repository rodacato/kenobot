import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import IdentityManager from '../../../src/cognitive/identity/identity-manager.js'

describe('IdentityManager', () => {
  let identityManager
  const mockPath = '/mock/identity/path'
  const mockProvider = {
    chat: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        tone: 'casual',
        verbosity: 'concise',
        language: 'es',
        emojiUsage: 'occasional',
        techContext: 'Node.js',
        confidence: 0.8
      })
    })
  }

  beforeEach(() => {
    identityManager = new IdentityManager(mockPath, mockProvider)
    vi.clearAllMocks()

    // Mock component methods
    identityManager.coreLoader.load = vi.fn().mockResolvedValue('Core personality')
    identityManager.rulesEngine.loadRules = vi.fn().mockResolvedValue({
      behavioral: [{ category: 'test', instruction: 'Be helpful' }],
      forbidden: [{ pattern: 'um', reason: 'Filler' }]
    })
    identityManager.rulesEngine.formatRulesForPrompt = vi.fn().mockReturnValue('Formatted rules')
    identityManager.preferencesManager.load = vi.fn().mockResolvedValue('User preferences')
    identityManager.preferencesManager.isBootstrapped = vi.fn().mockResolvedValue(true)
  })

  describe('initialization', () => {
    it('should initialize with all components', () => {
      expect(identityManager.coreLoader).toBeDefined()
      expect(identityManager.rulesEngine).toBeDefined()
      expect(identityManager.preferencesManager).toBeDefined()
    })

    it('should set isBootstrapped to false initially', () => {
      expect(identityManager.isBootstrapped).toBe(false)
    })
  })

  describe('load', () => {
    it('should load all identity components', async () => {
      const result = await identityManager.load()

      expect(result).toHaveProperty('core', 'Core personality')
      expect(result).toHaveProperty('rules')
      expect(result).toHaveProperty('preferences', 'User preferences')
      expect(identityManager.coreLoader.load).toHaveBeenCalledOnce()
      expect(identityManager.rulesEngine.loadRules).toHaveBeenCalledOnce()
      expect(identityManager.preferencesManager.load).toHaveBeenCalledOnce()
    })

    it('should check bootstrap status', async () => {
      await identityManager.load()

      expect(identityManager.preferencesManager.isBootstrapped).toHaveBeenCalledOnce()
      expect(identityManager.isBootstrapped).toBe(true)
    })
  })

  describe('buildContext', () => {
    it('should build identity context for LLM', async () => {
      identityManager.preferencesManager.isBootstrapped = vi.fn().mockResolvedValue(true)

      const context = await identityManager.buildContext()

      expect(context).toHaveProperty('core', 'Core personality')
      expect(context).toHaveProperty('behavioralRules', 'Formatted rules')
      expect(context).toHaveProperty('preferences', 'User preferences')
      expect(context).toHaveProperty('bootstrap', null)
    })

    it('should include bootstrap instructions if not complete', async () => {
      identityManager.preferencesManager.isBootstrapped = vi.fn().mockResolvedValue(false)
      identityManager.preferencesManager.getBootstrapInstructions = vi.fn().mockResolvedValue('Bootstrap instructions')

      const context = await identityManager.buildContext()

      expect(context.bootstrap).toBe('Bootstrap instructions')
    })
  })

  describe('saveBootstrapAnswers', () => {
    it('should save bootstrap answers', async () => {
      identityManager.preferencesManager.saveBootstrapAnswers = vi.fn().mockResolvedValue(undefined)

      await identityManager.saveBootstrapAnswers({ style: 'concise', language: 'spanish' })

      expect(identityManager.preferencesManager.saveBootstrapAnswers).toHaveBeenCalledWith({
        style: 'concise',
        language: 'spanish'
      })
      expect(identityManager.isBootstrapped).toBe(true)
    })
  })

  describe('updatePreference', () => {
    it('should update a single preference', async () => {
      identityManager.preferencesManager.updatePreference = vi.fn().mockResolvedValue(undefined)

      await identityManager.updatePreference('editor', 'vim')

      expect(identityManager.preferencesManager.updatePreference).toHaveBeenCalledWith('editor', 'vim')
    })
  })

  describe('proposeRule', () => {
    it('should return proposal ID', async () => {
      const proposalId = await identityManager.proposeRule({
        category: 'communication',
        instruction: 'Be concise'
      })

      expect(proposalId).toBe('proposal-id-placeholder')
    })
  })

  describe('getStatus', () => {
    it('should return identity status', async () => {
      identityManager.preferencesManager.hasPreferences = vi.fn().mockResolvedValue(true)

      // Load identity to set isBootstrapped
      await identityManager.load()

      const status = await identityManager.getStatus()

      expect(status).toHaveProperty('isBootstrapped', true)
      expect(status).toHaveProperty('rulesCount')
      expect(status.rulesCount.behavioral).toBe(1)
      expect(status.rulesCount.forbidden).toBe(1)
      expect(status).toHaveProperty('hasPreferences', true)
    })
  })

  describe('conversational bootstrap', () => {
    describe('initializeBootstrap', () => {
      it('should initialize bootstrap orchestrator', () => {
        const state = identityManager.initializeBootstrap()

        expect(state).toHaveProperty('phase', 'observing')
        expect(state).toHaveProperty('messageCount', 0)
        expect(state).toHaveProperty('observedProfile')
      })
    })

    describe('processBootstrapMessage', () => {
      beforeEach(() => {
        identityManager.initializeBootstrap()
      })

      it('should continue observation phase for first 5 messages', async () => {
        const messages = [
          { role: 'user', content: 'Hola' },
          { role: 'assistant', content: 'Hola! ¿En qué trabajas?' },
          { role: 'user', content: 'Desarrollo en Node' }
        ]

        const result = await identityManager.processBootstrapMessage('Test message', messages)

        expect(result.action).toBe('continue')
        expect(result.phase).toBe('observing')
      })

      it('should trigger checkpoint at message 6', async () => {
        // Simulate 5 messages
        for (let i = 0; i < 5; i++) {
          await identityManager.processBootstrapMessage('message', [])
        }

        // 6th message should trigger checkpoint
        const result = await identityManager.processBootstrapMessage('message 6', [])

        expect(result.action).toBe('show_checkpoint')
        expect(result.phase).toBe('checkpoint')
        expect(result.checkpointMessage).toBeDefined()
        expect(result.checkpointMessage).toContain('He notado que')
      })

      it('should move to boundaries after checkpoint confirmation', async () => {
        // Skip to checkpoint
        for (let i = 0; i < 6; i++) {
          await identityManager.processBootstrapMessage('message', [])
        }

        // Confirm checkpoint
        const result = await identityManager.processBootstrapMessage('Sí, perfecto', [])

        expect(result.action).toBe('show_boundaries')
        expect(result.phase).toBe('boundaries')
        expect(result.boundariesMessage).toBeDefined()
      })

      it('should infer profile with LLM when messages provided', async () => {
        const messages = [
          { role: 'user', content: 'Hola! Necesito ayuda con Node.js' },
          { role: 'assistant', content: 'Claro, ¿qué necesitas?' },
          { role: 'user', content: 'Implementar API REST' }
        ]

        await identityManager.processBootstrapMessage('Test', messages)

        expect(mockProvider.chat).toHaveBeenCalled()
      })
    })

    describe('bootstrap state management', () => {
      it('should get current bootstrap state', () => {
        identityManager.initializeBootstrap()

        const state = identityManager.getBootstrapState()

        expect(state).toHaveProperty('phase')
        expect(state).toHaveProperty('messageCount')
        expect(state).toHaveProperty('observedProfile')
      })

      it('should load bootstrap state', () => {
        const savedState = {
          phase: 'checkpoint',
          messageCount: 6,
          observedProfile: { tone: 'casual' },
          confirmedBoundaries: null
        }

        identityManager.loadBootstrapState(savedState)

        const state = identityManager.getBootstrapState()
        expect(state.phase).toBe('checkpoint')
        expect(state.messageCount).toBe(6)
      })
    })

    describe('isBootstrapping', () => {
      it('should return true when not bootstrapped', async () => {
        identityManager.preferencesManager.isBootstrapped = vi.fn().mockResolvedValue(false)

        const result = await identityManager.isBootstrapping()

        expect(result).toBe(true)
        expect(identityManager.preferencesManager.isBootstrapped).toHaveBeenCalled()
      })

      it('should return false when bootstrapped', async () => {
        identityManager.preferencesManager.isBootstrapped = vi.fn().mockResolvedValue(true)

        const result = await identityManager.isBootstrapping()

        expect(result).toBe(false)
        expect(identityManager.preferencesManager.isBootstrapped).toHaveBeenCalled()
      })

      it('should sync state from disk', async () => {
        // Initially in memory: false
        identityManager.isBootstrapped = false
        // But on disk: true (BOOTSTRAP.md doesn't exist)
        identityManager.preferencesManager.isBootstrapped = vi.fn().mockResolvedValue(true)

        await identityManager.isBootstrapping()

        // Should update memory state from disk
        expect(identityManager.isBootstrapped).toBe(true)
      })
    })
  })
})
