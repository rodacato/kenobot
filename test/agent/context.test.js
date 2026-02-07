import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress logger console output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ContextBuilder from '../../src/agent/context.js'

describe('ContextBuilder', () => {
  let context
  let mockStorage

  beforeEach(() => {
    mockStorage = {
      readFile: vi.fn().mockResolvedValue('# KenoBot Identity\nI am KenoBot.'),
      loadSession: vi.fn().mockResolvedValue([])
    }

    context = new ContextBuilder(
      { identityFile: 'identities/kenobot.md' },
      mockStorage
    )

    vi.clearAllMocks()
  })

  describe('loadIdentity', () => {
    it('should read identity file from storage', async () => {
      await context.loadIdentity()

      expect(mockStorage.readFile).toHaveBeenCalledWith('identities/kenobot.md')
    })

    it('should cache identity after first load', async () => {
      await context.loadIdentity()
      await context.loadIdentity()

      // Second call should still read (loadIdentity always reads)
      // but _identity should be set after first call
      expect(context._identity).toBe('# KenoBot Identity\nI am KenoBot.')
    })

    it('should use default identity file when not configured', async () => {
      const ctx = new ContextBuilder({}, mockStorage)
      await ctx.loadIdentity()

      expect(mockStorage.readFile).toHaveBeenCalledWith('identities/kenobot.md')
    })

    it('should throw if identity file is missing', async () => {
      mockStorage.readFile.mockRejectedValue(new Error('File not found: identities/kenobot.md'))

      await expect(context.loadIdentity()).rejects.toThrow('File not found: identities/kenobot.md')
    })
  })

  describe('build', () => {
    it('should return system, messages, and activeSkill', async () => {
      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result).toHaveProperty('system')
      expect(result).toHaveProperty('messages')
      expect(result).toHaveProperty('activeSkill')
      expect(result.system).toBe('# KenoBot Identity\nI am KenoBot.')
      expect(result.activeSkill).toBeNull()
    })

    it('should include current message as last user message', async () => {
      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toEqual({ role: 'user', content: 'hello' })
    })

    it('should include session history before current message', async () => {
      mockStorage.loadSession.mockResolvedValue([
        { role: 'user', content: 'previous question', timestamp: 1000 },
        { role: 'assistant', content: 'previous answer', timestamp: 1001 }
      ])

      const result = await context.build('telegram-123', { text: 'follow-up' })

      expect(result.messages).toHaveLength(3)
      expect(result.messages[0]).toEqual({ role: 'user', content: 'previous question' })
      expect(result.messages[1]).toEqual({ role: 'assistant', content: 'previous answer' })
      expect(result.messages[2]).toEqual({ role: 'user', content: 'follow-up' })
    })

    it('should strip timestamps from history messages', async () => {
      mockStorage.loadSession.mockResolvedValue([
        { role: 'user', content: 'hi', timestamp: 1000 }
      ])

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.messages[0]).toEqual({ role: 'user', content: 'hi' })
      expect(result.messages[0]).not.toHaveProperty('timestamp')
    })

    it('should load session with correct sessionId and default limit', async () => {
      await context.build('telegram-456', { text: 'test' })

      expect(mockStorage.loadSession).toHaveBeenCalledWith('telegram-456', 20)
    })

    it('should pass configured sessionHistoryLimit to loadSession', async () => {
      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot.md', sessionHistoryLimit: 50 },
        mockStorage
      )

      await ctx.build('telegram-123', { text: 'test' })

      expect(mockStorage.loadSession).toHaveBeenCalledWith('telegram-123', 50)
    })

    it('should auto-load identity on first build if not loaded', async () => {
      await context.build('telegram-123', { text: 'hello' })

      expect(mockStorage.readFile).toHaveBeenCalledWith('identities/kenobot.md')
      expect(context._identity).toBe('# KenoBot Identity\nI am KenoBot.')
    })

    it('should use cached identity on subsequent builds', async () => {
      await context.loadIdentity()
      vi.clearAllMocks()

      await context.build('telegram-123', { text: 'hello' })

      expect(mockStorage.readFile).not.toHaveBeenCalled()
    })

    it('should work with empty history (new session)', async () => {
      mockStorage.loadSession.mockResolvedValue([])

      const result = await context.build('telegram-123', { text: 'first message' })

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toEqual({ role: 'user', content: 'first message' })
    })
  })

  describe('build with memory', () => {
    let mockMemory

    beforeEach(() => {
      mockMemory = {
        getLongTermMemory: vi.fn().mockResolvedValue(''),
        getRecentDays: vi.fn().mockResolvedValue('')
      }

      context = new ContextBuilder(
        { identityFile: 'identities/kenobot.md', memoryDays: 3 },
        mockStorage,
        mockMemory
      )

      vi.clearAllMocks()
    })

    it('should include memory instructions in system prompt', async () => {
      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('## Memory')
      expect(result.system).toContain('<memory>')
      expect(result.system).toContain('How to remember things')
    })

    it('should include long-term memory when available', async () => {
      mockMemory.getLongTermMemory.mockResolvedValue('# Facts\n- User likes Star Wars')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('### Long-term memory')
      expect(result.system).toContain('User likes Star Wars')
    })

    it('should include recent daily notes when available', async () => {
      mockMemory.getRecentDays.mockResolvedValue('### 2026-02-07\n## 10:30 — User prefers Spanish')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('### Recent notes')
      expect(result.system).toContain('User prefers Spanish')
    })

    it('should skip long-term memory section when empty', async () => {
      mockMemory.getLongTermMemory.mockResolvedValue('')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('### Long-term memory')
    })

    it('should skip recent notes section when empty', async () => {
      mockMemory.getRecentDays.mockResolvedValue('')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('### Recent notes')
    })

    it('should use memoryDays from config', async () => {
      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot.md', memoryDays: 7 },
        mockStorage,
        mockMemory
      )

      await ctx.build('telegram-123', { text: 'hello' })

      expect(mockMemory.getRecentDays).toHaveBeenCalledWith(7)
    })

    it('should default to 3 days when memoryDays not configured', async () => {
      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot.md' },
        mockStorage,
        mockMemory
      )

      await ctx.build('telegram-123', { text: 'hello' })

      expect(mockMemory.getRecentDays).toHaveBeenCalledWith(3)
    })

    it('should still include identity at the start of system prompt', async () => {
      mockMemory.getLongTermMemory.mockResolvedValue('some memory')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system.startsWith('# KenoBot Identity')).toBe(true)
    })
  })

  describe('build with tools', () => {
    let mockToolRegistry

    beforeEach(() => {
      mockToolRegistry = {
        size: 2,
        getDefinitions: vi.fn().mockReturnValue([
          { name: 'web_fetch', description: 'Fetch a URL' },
          { name: 'n8n_trigger', description: 'Trigger workflow' }
        ])
      }

      context = new ContextBuilder(
        { identityFile: 'identities/kenobot.md' },
        mockStorage,
        null,
        mockToolRegistry
      )

      vi.clearAllMocks()
    })

    it('should include tool list in system prompt', async () => {
      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('## Available tools')
      expect(result.system).toContain('- web_fetch: Fetch a URL')
      expect(result.system).toContain('- n8n_trigger: Trigger workflow')
    })

    it('should not include tool section when registry is empty', async () => {
      mockToolRegistry.size = 0
      mockToolRegistry.getDefinitions.mockReturnValue([])

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## Available tools')
    })

    it('should not include tool section when no registry', async () => {
      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot.md' },
        mockStorage
      )

      const result = await ctx.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## Available tools')
    })
  })

  describe('build with skills', () => {
    let mockSkillLoader

    beforeEach(() => {
      mockSkillLoader = {
        size: 2,
        getAll: vi.fn().mockReturnValue([
          { name: 'weather', description: 'Get weather forecasts' },
          { name: 'summary', description: 'Summarize your day' }
        ]),
        match: vi.fn().mockReturnValue(null),
        getPrompt: vi.fn().mockResolvedValue(null)
      }

      context = new ContextBuilder(
        { identityFile: 'identities/kenobot.md' },
        mockStorage,
        null,
        null,
        mockSkillLoader
      )

      vi.clearAllMocks()
    })

    it('should include skill list in system prompt', async () => {
      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('## Available skills')
      expect(result.system).toContain('- weather: Get weather forecasts')
      expect(result.system).toContain('- summary: Summarize your day')
    })

    it('should not include skill section when loader is empty', async () => {
      mockSkillLoader.size = 0
      mockSkillLoader.getAll.mockReturnValue([])

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## Available skills')
    })

    it('should not include skill section when no loader', async () => {
      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot.md' },
        mockStorage
      )

      const result = await ctx.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## Available skills')
    })

    it('should inject active skill prompt when trigger matches', async () => {
      mockSkillLoader.match.mockReturnValue({ name: 'weather', description: 'Get weather forecasts' })
      mockSkillLoader.getPrompt.mockResolvedValue('## Weather\nFetch from wttr.in')

      const result = await context.build('telegram-123', { text: 'what is the weather?' })

      expect(result.system).toContain('## Active skill: weather')
      expect(result.system).toContain('Fetch from wttr.in')
      expect(result.activeSkill).toBe('weather')
      expect(mockSkillLoader.match).toHaveBeenCalledWith('what is the weather?')
      expect(mockSkillLoader.getPrompt).toHaveBeenCalledWith('weather')
    })

    it('should not inject active skill when no trigger matches', async () => {
      mockSkillLoader.match.mockReturnValue(null)

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## Active skill')
      expect(result.activeSkill).toBeNull()
      expect(mockSkillLoader.getPrompt).not.toHaveBeenCalled()
    })

    it('should not inject active skill when prompt load fails', async () => {
      mockSkillLoader.match.mockReturnValue({ name: 'weather', description: 'Get weather' })
      mockSkillLoader.getPrompt.mockResolvedValue(null)

      const result = await context.build('telegram-123', { text: 'weather?' })

      expect(result.system).not.toContain('## Active skill')
      expect(result.activeSkill).toBeNull()
    })

    it('should place skills section after tools section', async () => {
      const mockToolRegistry = {
        size: 1,
        getDefinitions: vi.fn().mockReturnValue([
          { name: 'web_fetch', description: 'Fetch a URL' }
        ])
      }

      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot.md' },
        mockStorage,
        null,
        mockToolRegistry,
        mockSkillLoader
      )

      const result = await ctx.build('telegram-123', { text: 'hello' })

      const toolsIdx = result.system.indexOf('## Available tools')
      const skillsIdx = result.system.indexOf('## Available skills')
      expect(toolsIdx).toBeGreaterThan(-1)
      expect(skillsIdx).toBeGreaterThan(toolsIdx)
    })
  })
})
