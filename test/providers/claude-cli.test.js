import { describe, it, expect, beforeEach, vi } from 'vitest'
import ClaudeCLIProvider from '../../src/providers/claude-cli.js'

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

    it('should prepend system prompt when provided', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat(
        [{ role: 'user', content: 'hello' }],
        { system: '# Identity\nI am KenoBot.' }
      )

      const args = spawnSpy.mock.calls[0][1]
      const prompt = args[args.length - 1]
      expect(prompt).toContain('# Identity\nI am KenoBot.')
      expect(prompt).toContain('---')
      expect(prompt).toContain('hello')
    })

    it('should pass Claudio-compatible flags', async () => {
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
  })

  describe('_spawn()', () => {
    it('should spawn with stdin ignored to prevent hanging', async () => {
      // Use echo as a simple command to verify spawn behavior
      const result = await provider._spawn('echo', ['hello world'])

      expect(result.stdout.trim()).toBe('hello world')
      expect(result.stderr).toBe('')
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
