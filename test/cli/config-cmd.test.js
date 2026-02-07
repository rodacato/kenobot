import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const CLI = join(import.meta.dirname, '..', '..', 'src', 'cli.js')

function makePaths(home) {
  return {
    home,
    envFile: join(home, 'config', '.env'),
    config: join(home, 'config'),
  }
}

describe('config-cmd', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-config-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('config show (default)', () => {
    it('redacts secret values', async () => {
      const paths = makePaths(tmpDir)
      await mkdir(paths.config, { recursive: true })
      await writeFile(paths.envFile, [
        'TELEGRAM_BOT_TOKEN=secret123',
        'ANTHROPIC_API_KEY=sk-ant-secret',
        'WEBHOOK_SECRET=hmac-secret',
        'PROVIDER=claude-api',
        'MODEL=sonnet',
      ].join('\n'))

      const { default: configCmd } = await import('../../src/cli/config-cmd.js')
      const logs = []
      const origLog = console.log
      console.log = (...args) => logs.push(args.join(' '))

      try {
        await configCmd([], paths)
      } finally {
        console.log = origLog
      }

      const output = logs.join('\n')
      expect(output).toContain('TELEGRAM_BOT_TOKEN=********')
      expect(output).toContain('ANTHROPIC_API_KEY=********')
      expect(output).toContain('WEBHOOK_SECRET=********')
      expect(output).not.toContain('secret123')
      expect(output).not.toContain('sk-ant-secret')
      expect(output).toContain('PROVIDER=claude-api')
      expect(output).toContain('MODEL=sonnet')
    })

    it('shows error when .env is missing', async () => {
      const paths = makePaths(tmpDir)
      const { default: configCmd } = await import('../../src/cli/config-cmd.js')

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })
      const mockError = vi.spyOn(console, 'error').mockImplementation(() => {})

      try {
        await configCmd([], paths)
      } catch {
        // expected
      }

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('No .env file found')
      )
      expect(mockExit).toHaveBeenCalledWith(1)

      mockExit.mockRestore()
      mockError.mockRestore()
    })
  })

  describe('config edit', () => {
    it('shows helpful error when editor is not found', async () => {
      const paths = makePaths(tmpDir)
      await mkdir(paths.config, { recursive: true })
      await writeFile(paths.envFile, 'PROVIDER=mock\n')

      const { default: configCmd } = await import('../../src/cli/config-cmd.js')

      const errors = []
      const mockError = vi.spyOn(console, 'error').mockImplementation((...args) => {
        errors.push(args.join(' '))
      })
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {})

      const origEditor = process.env.EDITOR
      process.env.EDITOR = 'nonexistent-editor-xyz'

      try {
        await configCmd(['edit'], paths)
      } catch {
        // spawn ENOENT rejects the promise after process.exit mock
      }

      if (origEditor === undefined) {
        delete process.env.EDITOR
      } else {
        process.env.EDITOR = origEditor
      }

      const output = errors.join('\n')
      expect(output).toContain('nonexistent-editor-xyz')
      expect(output).toContain('not found')

      mockError.mockRestore()
      mockExit.mockRestore()
    })
  })
})
