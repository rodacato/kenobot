import { describe, it, expect, beforeEach, vi } from 'vitest'
import GeminiCLIProvider from '../../src/providers/gemini-cli.js'

describe('GeminiCLIProvider', () => {
  let provider

  beforeEach(() => {
    provider = new GeminiCLIProvider({ model: 'flash' })
  })

  describe('name', () => {
    it('should return correct provider name', () => {
      expect(provider.name).toBe('gemini-cli')
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

    it('should pass correct Gemini CLI flags', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat([{ role: 'user', content: 'test' }])

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('--model')
      expect(args).toContain('flash')
      expect(args).toContain('--output-format')
      expect(args).toContain('text')
      expect(args).toContain('--approval-mode')
      expect(args).toContain('yolo')
      expect(args).toContain('-p')
    })

    it('should use model from options over config', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await provider.chat(
        [{ role: 'user', content: 'test' }],
        { model: 'pro' }
      )

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('pro')
      expect(args).not.toContain('flash')
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
        new Error('Gemini CLI exited with code 1: some error')
      )

      await expect(
        provider.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Gemini CLI failed')
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
  })

  describe('_spawn()', () => {
    it('should spawn with stdin ignored to prevent hanging', async () => {
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
