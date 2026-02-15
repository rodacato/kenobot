import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ProfileInferrer from '../../../../src/domain/cognitive/identity/profile-inferrer.js'

describe('ProfileInferrer', () => {
  let inferrer
  let mockProvider

  beforeEach(() => {
    mockProvider = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          tone: 'casual',
          verbosity: 'concise',
          language: 'es',
          emojiUsage: 'occasional',
          techContext: 'Node.js backend',
          confidence: 0.8
        })
      })
    }

    inferrer = new ProfileInferrer(mockProvider)
  })

  describe('inferProfile', () => {
    it('should return default profile when no messages', async () => {
      const profile = await inferrer.inferProfile([])

      expect(profile).toHaveProperty('tone', 'casual')
      expect(profile).toHaveProperty('verbosity', 'concise')
      expect(profile).toHaveProperty('language', 'es')
      expect(profile).toHaveProperty('confidence', 0.0)
      expect(mockProvider.chat).not.toHaveBeenCalled()
    })

    it('should infer profile from user messages', async () => {
      const messages = [
        { role: 'user', content: 'Hola! Necesito ayuda con Node' },
        { role: 'assistant', content: 'Claro, ¿qué necesitas?' },
        { role: 'user', content: 'API REST con Express' }
      ]

      const profile = await inferrer.inferProfile(messages)

      expect(mockProvider.chat).toHaveBeenCalled()
      expect(profile.tone).toBe('casual')
      expect(profile.verbosity).toBe('concise')
      expect(profile.language).toBe('es')
      expect(profile.techContext).toBe('Node.js backend')
      expect(profile.confidence).toBe(0.8)
    })

    it('should filter to user messages only', async () => {
      const messages = [
        { role: 'user', content: 'User message 1' },
        { role: 'assistant', content: 'Assistant message' },
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message 2' }
      ]

      await inferrer.inferProfile(messages)

      const promptCall = mockProvider.chat.mock.calls[0][0][0].content
      expect(promptCall).toContain('User message 1')
      expect(promptCall).toContain('User message 2')
      expect(promptCall).not.toContain('Assistant message')
      expect(promptCall).not.toContain('System message')
    })

    it('should handle LLM error gracefully', async () => {
      mockProvider.chat.mockRejectedValue(new Error('LLM failed'))

      const profile = await inferrer.inferProfile([
        { role: 'user', content: 'Test message' }
      ])

      expect(profile).toHaveProperty('confidence', 0.0)
      expect(profile).toHaveProperty('tone')
      expect(profile).toHaveProperty('verbosity')
    })

    it('should handle malformed JSON response', async () => {
      mockProvider.chat.mockResolvedValue({
        content: 'This is not JSON'
      })

      const profile = await inferrer.inferProfile([
        { role: 'user', content: 'Test' }
      ])

      expect(profile).toHaveProperty('confidence', 0.0)
    })

    it('should extract JSON from text response', async () => {
      mockProvider.chat.mockResolvedValue({
        content: `Here is the analysis:

{
  "tone": "formal",
  "verbosity": "detailed",
  "language": "en",
  "emojiUsage": "none",
  "techContext": "Python",
  "confidence": 0.9
}

Hope this helps!`
      })

      const profile = await inferrer.inferProfile([
        { role: 'user', content: 'Test' }
      ])

      expect(profile.tone).toBe('formal')
      expect(profile.verbosity).toBe('detailed')
      expect(profile.confidence).toBe(0.9)
    })
  })

  describe('isConfident', () => {
    it('should return true for high confidence', () => {
      const profile = { confidence: 0.8 }

      expect(inferrer.isConfident(profile)).toBe(true)
    })

    it('should return false for low confidence', () => {
      const profile = { confidence: 0.3 }

      expect(inferrer.isConfident(profile)).toBe(false)
    })

    it('should return true for exactly 0.6 confidence', () => {
      const profile = { confidence: 0.6 }

      expect(inferrer.isConfident(profile)).toBe(true)
    })
  })

  describe('prompt building', () => {
    it('should build inference prompt with user messages', async () => {
      const messages = [
        { role: 'user', content: 'Message 1' },
        { role: 'user', content: 'Message 2' }
      ]

      await inferrer.inferProfile(messages)

      const prompt = mockProvider.chat.mock.calls[0][0][0].content

      expect(prompt).toContain('Message 1')
      expect(prompt).toContain('Message 2')
      expect(prompt).toContain('tone')
      expect(prompt).toContain('verbosity')
      expect(prompt).toContain('language')
      expect(prompt).toContain('ONLY the JSON')
    })
  })

  describe('edge cases', () => {
    it('should handle null messages', async () => {
      const profile = await inferrer.inferProfile(null)

      expect(profile).toHaveProperty('confidence', 0.0)
      expect(mockProvider.chat).not.toHaveBeenCalled()
    })

    it('should handle undefined messages', async () => {
      const profile = await inferrer.inferProfile(undefined)

      expect(profile).toHaveProperty('confidence', 0.0)
    })

    it('should handle messages with only assistant/system', async () => {
      const messages = [
        { role: 'assistant', content: 'Assistant message' },
        { role: 'system', content: 'System message' }
      ]

      const profile = await inferrer.inferProfile(messages)

      expect(profile).toHaveProperty('confidence', 0.0)
      expect(mockProvider.chat).not.toHaveBeenCalled()
    })
  })

  describe('profile validation', () => {
    it('should validate required fields in parsed response', async () => {
      mockProvider.chat.mockResolvedValue({
        content: JSON.stringify({
          tone: 'casual',
          verbosity: 'concise'
          // Missing fields
        })
      })

      const profile = await inferrer.inferProfile([
        { role: 'user', content: 'Test' }
      ])

      // Should fall back to default
      expect(profile).toHaveProperty('confidence', 0.0)
      expect(profile).toHaveProperty('language')
      expect(profile).toHaveProperty('emojiUsage')
    })
  })
})
