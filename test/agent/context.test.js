import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// Suppress logger console output during tests
vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ContextBuilder from '../../src/agent/context.js'
import FilesystemStorage from '../../src/storage/filesystem.js'
import MemoryManager from '../../src/agent/memory.js'
import IdentityLoader from '../../src/agent/identity.js'
import ToolRegistry from '../../src/tools/registry.js'
import BaseTool from '../../src/tools/base.js'
import SkillLoader from '../../src/skills/loader.js'

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

      expect(mockStorage.readFile).toHaveBeenCalledWith('identities/kenobot')
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
        getRecentDays: vi.fn().mockResolvedValue(''),
        getChatLongTermMemory: vi.fn().mockResolvedValue(''),
        getChatRecentDays: vi.fn().mockResolvedValue(''),
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

  describe('build with identityLoader', () => {
    let mockIdentityLoader

    beforeEach(() => {
      mockIdentityLoader = {
        load: vi.fn(),
        getSoul: vi.fn().mockReturnValue('# Soul\nI am friendly.'),
        getIdentity: vi.fn().mockReturnValue('# Identity\nExpert in Node.js.'),
        getUser: vi.fn().mockResolvedValue(''),
        getBootstrap: vi.fn().mockResolvedValue(null),
        appendUser: vi.fn(),
        reload: vi.fn()
      }

      context = new ContextBuilder(
        { identityFile: 'identities/kenobot' },
        mockStorage,
        null,
        null,
        null,
        mockIdentityLoader
      )

      vi.clearAllMocks()
    })

    it('should use identityLoader for system prompt', async () => {
      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('# Soul')
      expect(result.system).toContain('I am friendly.')
      expect(result.system).toContain('# Identity')
      expect(result.system).toContain('Expert in Node.js.')
    })

    it('should include user profile when USER.md has content', async () => {
      mockIdentityLoader.getUser.mockResolvedValue('# User\n- Name: Carlos')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('## User Profile')
      expect(result.system).toContain('Name: Carlos')
      expect(result.system).toContain('<user>')
      expect(result.system).toContain('How to update user preferences')
    })

    it('should not include user profile section when USER.md is empty', async () => {
      mockIdentityLoader.getUser.mockResolvedValue('')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## User Profile')
    })

    it('should delegate loadIdentity to identityLoader', async () => {
      await context.loadIdentity()

      expect(mockIdentityLoader.load).toHaveBeenCalled()
      expect(mockStorage.readFile).not.toHaveBeenCalled()
    })

    it('should not use legacy _identity when identityLoader is present', async () => {
      const result = await context.build('telegram-123', { text: 'hello' })

      expect(context._identity).toBeNull()
      expect(result.system).toContain('# Soul')
    })

    it('should inject bootstrap section when BOOTSTRAP.md exists', async () => {
      mockIdentityLoader.getBootstrap = vi.fn().mockResolvedValue('# Hey, I just came online.')

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('## First Conversation — Bootstrap')
      expect(result.system).toContain('Hey, I just came online.')
    })

    it('should not inject bootstrap section when no BOOTSTRAP.md', async () => {
      mockIdentityLoader.getBootstrap = vi.fn().mockResolvedValue(null)

      const result = await context.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## First Conversation — Bootstrap')
    })

    it('should place bootstrap section after user profile and before tools', async () => {
      const mockToolRegistry = {
        size: 1,
        getDefinitions: vi.fn().mockReturnValue([
          { name: 'web_fetch', description: 'Fetch a URL' }
        ])
      }
      mockIdentityLoader.getUser.mockResolvedValue('# User\n- Name: Carlos')
      mockIdentityLoader.getBootstrap = vi.fn().mockResolvedValue('# Bootstrap content')

      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot' },
        mockStorage,
        null,
        mockToolRegistry,
        null,
        mockIdentityLoader
      )

      const result = await ctx.build('telegram-123', { text: 'hello' })

      const userIdx = result.system.indexOf('## User Profile')
      const bootstrapIdx = result.system.indexOf('## First Conversation — Bootstrap')
      const toolsIdx = result.system.indexOf('## Available tools')
      expect(userIdx).toBeGreaterThan(-1)
      expect(bootstrapIdx).toBeGreaterThan(userIdx)
      expect(toolsIdx).toBeGreaterThan(bootstrapIdx)
    })

    it('should place user profile before tools and skills', async () => {
      const mockToolRegistry = {
        size: 1,
        getDefinitions: vi.fn().mockReturnValue([
          { name: 'web_fetch', description: 'Fetch a URL' }
        ])
      }
      mockIdentityLoader.getUser.mockResolvedValue('# User\n- Name: Carlos')

      const ctx = new ContextBuilder(
        { identityFile: 'identities/kenobot' },
        mockStorage,
        null,
        mockToolRegistry,
        null,
        mockIdentityLoader
      )

      const result = await ctx.build('telegram-123', { text: 'hello' })

      const userIdx = result.system.indexOf('## User Profile')
      const toolsIdx = result.system.indexOf('## Available tools')
      expect(userIdx).toBeGreaterThan(-1)
      expect(toolsIdx).toBeGreaterThan(userIdx)
    })
  })

  describe('integration', () => {
    let tmpDir, storage, memory, toolRegistry, skillLoader, identityLoader, ctx

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-ctx-int-'))

      // Create identity directory with SOUL.md and IDENTITY.md
      const identityDir = join(tmpDir, 'identities', 'kenobot')
      await mkdir(identityDir, { recursive: true })
      await writeFile(join(identityDir, 'SOUL.md'), '# Soul\nI am friendly and helpful.')
      await writeFile(join(identityDir, 'IDENTITY.md'), '# Identity\nExpert in Node.js.')
      await writeFile(join(identityDir, 'USER.md'), '- Name: Carlos\n- Language: Spanish')

      // Create skills
      const skillsDir = join(tmpDir, 'skills')
      const weatherDir = join(skillsDir, 'weather')
      await mkdir(weatherDir, { recursive: true })
      await writeFile(join(weatherDir, 'manifest.json'), JSON.stringify({
        name: 'weather',
        description: 'Get weather forecasts',
        triggers: ['weather', 'forecast']
      }))
      await writeFile(join(weatherDir, 'SKILL.md'), '## Weather\nFetch from wttr.in')

      // Create memory
      const memDir = join(tmpDir, 'memory')
      await mkdir(memDir, { recursive: true })
      await writeFile(join(memDir, 'MEMORY.md'), '# Facts\n- User likes Star Wars')
      await writeFile(join(memDir, '2026-02-07.md'), '## 10:30 — User prefers dark mode\n')

      // Create session history
      const sessionsDir = join(tmpDir, 'sessions')
      await mkdir(sessionsDir, { recursive: true })
      await writeFile(join(sessionsDir, 'telegram-123.jsonl'), [
        '{"role":"user","content":"previous question","timestamp":1000}',
        '{"role":"assistant","content":"previous answer","timestamp":1001}'
      ].join('\n'))

      // Wire real components
      storage = new FilesystemStorage({ dataDir: tmpDir })
      memory = new MemoryManager(tmpDir)
      identityLoader = new IdentityLoader(join(tmpDir, 'identities', 'kenobot'))
      await identityLoader.load()

      toolRegistry = new ToolRegistry()
      class FakeTool extends BaseTool {
        get definition() {
          return { name: 'test_tool', description: 'A test tool', input_schema: { type: 'object', properties: {} } }
        }
        async execute() { return 'ok' }
      }
      toolRegistry.register(new FakeTool())

      skillLoader = new SkillLoader(skillsDir)
      await skillLoader.loadAll()

      ctx = new ContextBuilder(
        { identityFile: join(tmpDir, 'identities', 'kenobot'), memoryDays: 3 },
        storage,
        memory,
        toolRegistry,
        skillLoader,
        identityLoader
      )
    })

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    it('should assemble system prompt with all real components', async () => {
      const result = await ctx.build('telegram-123', { text: 'hello' })

      // Identity sections
      expect(result.system).toContain('I am friendly and helpful.')
      expect(result.system).toContain('Expert in Node.js.')

      // User profile
      expect(result.system).toContain('## User Profile')
      expect(result.system).toContain('Name: Carlos')

      // Tools
      expect(result.system).toContain('## Available tools')
      expect(result.system).toContain('test_tool')

      // Skills
      expect(result.system).toContain('## Available skills')
      expect(result.system).toContain('weather')

      // Memory
      expect(result.system).toContain('User likes Star Wars')
      expect(result.system).toContain('User prefers dark mode')
    })

    it('should load session history from real JSONL files', async () => {
      const result = await ctx.build('telegram-123', { text: 'follow-up' })

      expect(result.messages).toHaveLength(3)
      expect(result.messages[0]).toEqual({ role: 'user', content: 'previous question' })
      expect(result.messages[1]).toEqual({ role: 'assistant', content: 'previous answer' })
      expect(result.messages[2]).toEqual({ role: 'user', content: 'follow-up' })
    })

    it('should inject active skill when trigger matches', async () => {
      const result = await ctx.build('telegram-123', { text: 'what is the weather?' })

      expect(result.system).toContain('## Active skill: weather')
      expect(result.system).toContain('Fetch from wttr.in')
      expect(result.activeSkill).toBe('weather')
    })

    it('should not inject skill when no trigger matches', async () => {
      const result = await ctx.build('telegram-123', { text: 'hello' })

      expect(result.system).not.toContain('## Active skill')
      expect(result.activeSkill).toBeNull()
    })

    it('should work with new session (no JSONL file)', async () => {
      const result = await ctx.build('telegram-new', { text: 'first message' })

      expect(result.messages).toHaveLength(1)
      expect(result.messages[0]).toEqual({ role: 'user', content: 'first message' })
    })

    it('should inject bootstrap when BOOTSTRAP.md exists', async () => {
      // Add BOOTSTRAP.md to identity dir
      const identityDir = join(tmpDir, 'identities', 'kenobot')
      await writeFile(join(identityDir, 'BOOTSTRAP.md'), '# Hey, I just came online.\nLet me learn about you.')

      // Reload identity to pick up new file
      await identityLoader.reload()

      const result = await ctx.build('telegram-123', { text: 'hello' })

      expect(result.system).toContain('## First Conversation — Bootstrap')
      expect(result.system).toContain('Hey, I just came online.')
    })

    it('should not inject bootstrap after BOOTSTRAP.md is deleted', async () => {
      // Add then delete BOOTSTRAP.md
      const identityDir = join(tmpDir, 'identities', 'kenobot')
      await writeFile(join(identityDir, 'BOOTSTRAP.md'), '# Bootstrap content')

      const result1 = await ctx.build('telegram-123', { text: 'hello' })
      expect(result1.system).toContain('## First Conversation — Bootstrap')

      await identityLoader.deleteBootstrap()

      const result2 = await ctx.build('telegram-123', { text: 'hello again' })
      expect(result2.system).not.toContain('## First Conversation — Bootstrap')
    })

    it('should maintain correct section ordering', async () => {
      const result = await ctx.build('telegram-123', { text: 'hello' })
      const sys = result.system

      const soulIdx = sys.indexOf('# Soul')
      const identityIdx = sys.indexOf('# Identity')
      const userIdx = sys.indexOf('## User Profile')
      const toolsIdx = sys.indexOf('## Available tools')
      const skillsIdx = sys.indexOf('## Available skills')
      const memoryIdx = sys.indexOf('## Memory')

      expect(soulIdx).toBeLessThan(identityIdx)
      expect(identityIdx).toBeLessThan(userIdx)
      expect(userIdx).toBeLessThan(toolsIdx)
      expect(toolsIdx).toBeLessThan(skillsIdx)
      expect(skillsIdx).toBeLessThan(memoryIdx)
    })
  })
})
