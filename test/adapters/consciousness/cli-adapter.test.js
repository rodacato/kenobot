import CLIConsciousnessAdapter from '../../../src/adapters/consciousness/cli-adapter.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('CLIConsciousnessAdapter', () => {
  let adapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new CLIConsciousnessAdapter({
      command: 'gemini',
      model: 'gemini-2.0-flash',
      timeout: 5000
    })
  })

  describe('call', () => {
    it('spawns CLI with correct arguments', async () => {
      const spawnSpy = vi.spyOn(adapter, '_spawn').mockResolvedValue({
        stdout: '{"expanded": ["test"]}',
        stderr: ''
      })

      await adapter.call('You are an expert.', 'Expand these keywords: test')

      const [command, args] = spawnSpy.mock.calls[0]
      expect(command).toBe('gemini')
      expect(args).toContain('--model')
      expect(args).toContain('gemini-2.0-flash')
      expect(args).toContain('--output-format')
      expect(args).toContain('text')
      expect(args).toContain('--approval-mode')
      expect(args).toContain('yolo')
      expect(args).toContain('-p')
    })

    it('combines system prompt and task prompt with separator', async () => {
      const spawnSpy = vi.spyOn(adapter, '_spawn').mockResolvedValue({
        stdout: 'response',
        stderr: ''
      })

      await adapter.call('System prompt here', 'Task prompt here')

      const prompt = spawnSpy.mock.calls[0][1][spawnSpy.mock.calls[0][1].indexOf('-p') + 1]
      expect(prompt).toContain('System prompt here')
      expect(prompt).toContain('---')
      expect(prompt).toContain('Task prompt here')
    })

    it('returns trimmed stdout', async () => {
      vi.spyOn(adapter, '_spawn').mockResolvedValue({
        stdout: '  {"result": true}  \n',
        stderr: ''
      })

      const result = await adapter.call('sys', 'task')
      expect(result).toBe('{"result": true}')
    })

    it('throws on CLI failure', async () => {
      vi.spyOn(adapter, '_spawn').mockRejectedValue(
        new Error('Consciousness CLI exited with code 1: some error')
      )

      await expect(adapter.call('sys', 'task')).rejects.toThrow('Consciousness CLI exited with code 1')
    })

    it('uses configurable command', async () => {
      const claudeAdapter = new CLIConsciousnessAdapter({ command: 'claude', model: 'haiku' })
      const spawnSpy = vi.spyOn(claudeAdapter, '_spawn').mockResolvedValue({
        stdout: 'ok',
        stderr: ''
      })

      await claudeAdapter.call('sys', 'task')
      expect(spawnSpy.mock.calls[0][0]).toBe('claude')
    })
  })

  describe('_spawn', () => {
    it('runs a real command successfully', async () => {
      const testAdapter = new CLIConsciousnessAdapter({ command: 'echo', timeout: 5000 })
      const { stdout } = await testAdapter._spawn('echo', ['hello'])
      expect(stdout.trim()).toBe('hello')
    })

    it('rejects on non-zero exit code', async () => {
      const testAdapter = new CLIConsciousnessAdapter({ timeout: 5000 })
      await expect(testAdapter._spawn('sh', ['-c', 'exit 1'])).rejects.toThrow('exited with code 1')
    })

    it('rejects on command not found', async () => {
      const testAdapter = new CLIConsciousnessAdapter({ timeout: 5000 })
      await expect(testAdapter._spawn('nonexistent_command_xyz', [])).rejects.toThrow()
    })

    it('rejects on timeout', async () => {
      const slowAdapter = new CLIConsciousnessAdapter({ timeout: 100 })
      await expect(slowAdapter._spawn('sleep', ['10'])).rejects.toThrow('timed out')
    })
  })
})
