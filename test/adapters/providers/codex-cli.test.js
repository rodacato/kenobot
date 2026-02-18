import { describe, it, expect, beforeEach, vi } from 'vitest'
import CodexCLIProvider from '../../../src/adapters/providers/codex-cli.js'

describe('CodexCLIProvider', () => {
  let provider

  beforeEach(() => {
    provider = new CodexCLIProvider({ model: 'gpt-5.3-codex' })
  })

  describe('name', () => {
    it('should return correct provider name', () => {
      expect(provider.name).toBe('codex-cli')
    })
  })

  describe('chat()', () => {
    it('should pass single message content as prompt', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('hello back', { input_tokens: 100, output_tokens: 10 }),
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
        stdout: jsonlOutput('response'),
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
        stdout: jsonlOutput('response'),
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

    it('should pass correct Codex CLI flags', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('response'),
        stderr: ''
      })

      await provider.chat([{ role: 'user', content: 'test' }])

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('exec')
      expect(args).toContain('--ephemeral')
      expect(args).toContain('--skip-git-repo-check')
      expect(args).toContain('--json')
      expect(args).toContain('--model')
      expect(args).toContain('gpt-5.3-codex')
    })

    it('should use model from options over config', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('response'),
        stderr: ''
      })

      await provider.chat(
        [{ role: 'user', content: 'test' }],
        { model: 'o3' }
      )

      const args = spawnSpy.mock.calls[0][1]
      expect(args).toContain('o3')
      expect(args).not.toContain('gpt-5.3-codex')
    })

    it('should extract usage tokens from JSONL output', async () => {
      vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('response', { input_tokens: 500, cached_input_tokens: 200, output_tokens: 50 }),
        stderr: ''
      })

      const result = await provider.chat([{ role: 'user', content: 'test' }])
      expect(result.usage).toEqual({ input_tokens: 500, output_tokens: 50 })
    })

    it('should handle output without usage data', async () => {
      vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'hello' } }),
        stderr: ''
      })

      const result = await provider.chat([{ role: 'user', content: 'test' }])
      expect(result.content).toBe('hello')
      expect(result.usage).toBeUndefined()
    })

    it('should trim content whitespace', async () => {
      vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('  hello there  \n'),
        stderr: ''
      })

      const result = await provider.chat([{ role: 'user', content: 'hi' }])
      expect(result.content).toBe('hello there')
    })

    it('should handle empty messages', async () => {
      vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('response'),
        stderr: ''
      })

      const result = await provider.chat([{ role: 'user', content: '' }])
      expect(result.content).toBe('response')
    })

    it('should throw on CLI failure', async () => {
      vi.spyOn(provider, '_spawn').mockRejectedValue(
        new Error('Codex CLI exited with code 1: some error')
      )

      await expect(
        provider.chat([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Codex CLI failed')
    })

    it('should default cwd to $HOME', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('response'),
        stderr: ''
      })

      await provider.chat([{ role: 'user', content: 'test' }])

      const spawnOptions = spawnSpy.mock.calls[0][2]
      expect(spawnOptions.cwd).toBe(process.env.HOME)
    })

    it('should pass explicit cwd from options', async () => {
      const spawnSpy = vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: jsonlOutput('response'),
        stderr: ''
      })

      await provider.chat(
        [{ role: 'user', content: 'test' }],
        { cwd: '/tmp/my-project' }
      )

      const spawnOptions = spawnSpy.mock.calls[0][2]
      expect(spawnOptions.cwd).toBe('/tmp/my-project')
    })

    it('should skip non-JSON lines gracefully', async () => {
      vi.spyOn(provider, '_spawn').mockResolvedValue({
        stdout: 'some noise\n' + jsonlOutput('actual response'),
        stderr: ''
      })

      const result = await provider.chat([{ role: 'user', content: 'test' }])
      expect(result.content).toBe('actual response')
    })

    it('should use last agent_message when multiple are present', async () => {
      const lines = [
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
        JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'thinking...' } }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final answer' } }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20 } })
      ].join('\n')

      vi.spyOn(provider, '_spawn').mockResolvedValue({ stdout: lines, stderr: '' })

      const result = await provider.chat([{ role: 'user', content: 'test' }])
      expect(result.content).toBe('final answer')
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

/**
 * Helper to build realistic JSONL output from codex exec --json
 */
function jsonlOutput(text, usage) {
  const lines = [
    JSON.stringify({ type: 'thread.started', thread_id: 'test-thread' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text } })
  ]
  if (usage) {
    lines.push(JSON.stringify({ type: 'turn.completed', usage }))
  }
  return lines.join('\n')
}
