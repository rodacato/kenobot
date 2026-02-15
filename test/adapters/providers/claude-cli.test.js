import { describe, it, expect, beforeEach, vi } from 'vitest'
import ClaudeCLIProvider from '../../../src/adapters/providers/claude-cli.js'

describe('ClaudeCLIProvider', () => {
  let provider

  beforeEach(() => {
    provider = new ClaudeCLIProvider({ model: 'sonnet' })
  })

  describe('name', () => {
    it('should return correct provider name', () => {
      expect(provider.name).toBe('claude-cli')
    })
  })

  describe('chat()', () => {
    it('should pass single message content as prompt', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'hello back',
        stderr: ''
      })

      const result = await provider.chat([
        { role: 'user', content: 'hello' }
      ])

      expect(result.content).toBe('hello back')

      const args = spawnSpy.mock.calls[0][1]
      const prompt = args[args.length - 1]
      expect(prompt).toBe('hello')
    })

    it('should format multi-message history with role prefixes', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'second' }
      ])

      const args = spawnSpy.mock.calls[0][1]
      const prompt = args[args.length - 1]
      expect(prompt).toContain('Human: first')
      expect(prompt).toContain('Assistant: reply')
      expect(prompt).toContain('Human: second')
    })

    it('should pass system prompt as dedicated flag', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat(
        [{ role: 'user', content: 'hello' }],
        { system: '# Identity\nI am KenoBot.' }
      )

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('--system-prompt')
      const systemIndex = args.indexOf('--system-prompt')
      expect(args[systemIndex + 1]).toBe('# Identity\nI am KenoBot.')

      // User prompt should NOT contain system prompt
      const prompt = args[args.length - 1]
      expect(prompt).not.toContain('# Identity')
      expect(prompt).toBe('hello')
    })

    it('should pass required flags with budget protection', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat([{ role: 'user', content: 'test' }])

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('--dangerously-skip-permissions')
      expect(args).toContain('--disable-slash-commands')
      expect(args).toContain('--no-chrome')
      expect(args).toContain('--no-session-persistence')
      expect(args).toContain('bypassPermissions')
      expect(args).toContain('sonnet')
      expect(args).toContain('--max-budget-usd')
      expect(args).toContain('5.0')
      expect(args).toContain('--print')
    })

    it('should use model from options over config', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat(
        [{ role: 'user', content: 'test' }],
        { model: 'haiku' }
      )

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('haiku')
      expect(args).not.toContain('sonnet')
    })

    it('should trim stdout whitespace', async () => {
      vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: '  hello there  \n',
        stderr: ''
      })

      const result = await provider.chat([{ role: 'user', content: 'hi' }])
      expect(result.content).toBe('hello there')
    })

    it('should handle empty messages', async () => {
      vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      const result = await provider.chat([{ role: 'user', content: '' }])
      expect(result.content).toBe('response')
    })

    it('should throw on CLI failure', async () => {
      vi.spyOn(provider, '_spawn').mockRejectedValue(
        new Error('Claude CLI exited with code 1: some error')
      )

      await expect(
        provider.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Claude CLI failed')
    })

    it('should default cwd to $HOME', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat([{ role: 'user', content: 'test' }])

      const spawnOptions = spawnSpy.mock.calls[0][2]
      expect(spawnOptions.cwd).toBe(process.env.HOME)
    })

    it('should pass explicit cwd from options', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat(
        [{ role: 'user', content: 'test' }],
        { cwd: '/tmp/my-project' }
      )

      const spawnOptions = spawnSpy.mock.calls[0][2]
      expect(spawnOptions.cwd).toBe('/tmp/my-project')
    })

    it('should enable debug mode when KENOBOT_DEBUG is true', async () => {
      const originalDebug = process.env.KENOBOT_DEBUG
      process.env.KENOBOT_DEBUG = 'true'

      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat([{ role: 'user', content: 'test' }])

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('--debug')

      process.env.KENOBOT_DEBUG = originalDebug
    })

    it('should enable debug mode when config.debug is true', async () => {
      const debugProvider = new ClaudeCLIProvider({ model: 'sonnet', debug: true })
      const spawnSpy = vi.spyOn(debugProvider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await debugProvider.chat([{ role: 'user', content: 'test' }])

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('--debug')
    })

    it('should use custom maxBudgetUsd from config', async () => {
      const budgetProvider = new ClaudeCLIProvider({ model: 'sonnet', maxBudgetUsd: '10.0' })
      const spawnSpy = vi.spyOn(budgetProvider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await budgetProvider.chat([{ role: 'user', content: 'test' }])

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('--max-budget-usd')
      const budgetIndex = args.indexOf('--max-budget-usd')
      expect(args[budgetIndex + 1]).toBe('10.0')
    })
  })

  describe('_spawn()', () => {
    it('should spawn with stdin ignored to prevent hanging', async () => {
      // Use echo as a simple command to verify spawn behavior
      const result = await provider._spawn('echo', ['hello world'])

      expect(result.stdout.trim()).toBe('hello world')
      expect(result.stderr).toBe('')
    })

    it('should use cwd when provided', async () => {
      const result = await provider._spawn('pwd', [], { cwd: '/tmp' })
      expect(result.stdout.trim()).toBe('/tmp')
    })

    it('should reject on non-zero exit code', async () => {
      await expect(
        provider._spawn('sh', ['-c', 'exit 1'])
      ).rejects.toThrow('exited with code 1')
    })

    it('should reject on command not found', async () => {
      await expect(
        provider._spawn('nonexistent-command-xyz', [])
      ).rejects.toThrow()
    })
  })
})
