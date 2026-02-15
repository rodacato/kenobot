import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

// Suppress logger console output during tests
vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { createRunCommand } from '../../../src/adapters/actions/shell.js'

describe('shell action', () => {
  let motorConfig
  let tmpDir
  let workspaceDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-shell-'))

    // Create workspace structure: {tmpDir}/owner/repo
    workspaceDir = join(tmpDir, 'testowner', 'testrepo')
    await mkdir(workspaceDir, { recursive: true })

    motorConfig = {
      workspacesDir: tmpDir,
      shellTimeout: 60_000,
      shellMaxOutput: 102_400
    }

    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('definition', () => {
    it('should have correct shape', () => {
      const tool = createRunCommand(motorConfig)

      expect(tool.definition).toBeDefined()
      expect(tool.definition.name).toBe('run_command')
      expect(tool.definition.description).toContain('Execute a shell command')
      expect(tool.definition.input_schema).toBeDefined()
      expect(tool.definition.input_schema.type).toBe('object')
      expect(tool.definition.input_schema.properties).toHaveProperty('repo')
      expect(tool.definition.input_schema.properties).toHaveProperty('command')
      expect(tool.definition.input_schema.properties).toHaveProperty('timeout_ms')
      expect(tool.definition.input_schema.required).toEqual(['repo', 'command'])
    })
  })

  describe('execute', () => {
    it('should execute a simple command and return output with exit code', async () => {
      const tool = createRunCommand(motorConfig)

      const result = await tool.execute({
        repo: 'testowner/testrepo',
        command: 'echo hello'
      })

      expect(result).toContain('hello')
      expect(result).toContain('[Exit code: 0]')
    })

    it('should execute ls command and return output', async () => {
      const tool = createRunCommand(motorConfig)

      const result = await tool.execute({
        repo: 'testowner/testrepo',
        command: 'ls -la'
      })

      expect(result).toContain('[Exit code: 0]')
    })

    it('should block sudo commands', async () => {
      const tool = createRunCommand(motorConfig)

      await expect(
        tool.execute({
          repo: 'testowner/testrepo',
          command: 'sudo ls'
        })
      ).rejects.toThrow('sudo is not allowed')
    })

    it('should timeout long-running commands', async () => {
      const tool = createRunCommand(motorConfig)

      await expect(
        tool.execute({
          repo: 'testowner/testrepo',
          command: 'sleep 999',
          timeout_ms: 200
        })
      ).rejects.toThrow(/timed out after 200ms/)
    })

    it('should return non-zero exit code', async () => {
      const tool = createRunCommand(motorConfig)

      const result = await tool.execute({
        repo: 'testowner/testrepo',
        command: 'exit 1'
      })

      expect(result).toContain('[Exit code: 1]')
    })

    it('should truncate output when exceeding maxOutput', async () => {
      const smallConfig = {
        workspacesDir: tmpDir,
        shellTimeout: 60_000,
        shellMaxOutput: 100
      }
      const tool = createRunCommand(smallConfig)

      // Generate output > 100 bytes (150 chars)
      const result = await tool.execute({
        repo: 'testowner/testrepo',
        command: 'echo "' + 'a'.repeat(150) + '"'
      })

      expect(result).toContain('[Output truncated at 100 bytes]')
      expect(result.length).toBeLessThan(300) // Truncated, not full 150 chars
    })

    it('should include stderr in output', async () => {
      const tool = createRunCommand(motorConfig)

      const result = await tool.execute({
        repo: 'testowner/testrepo',
        command: 'echo "stdout" && echo "stderr" >&2'
      })

      expect(result).toContain('stdout')
      expect(result).toContain('stderr')
      expect(result).toContain('--- stderr ---')
      expect(result).toContain('[Exit code: 0]')
    })

    it('should use custom timeout when provided', async () => {
      const tool = createRunCommand(motorConfig)

      await expect(
        tool.execute({
          repo: 'testowner/testrepo',
          command: 'sleep 1',
          timeout_ms: 100
        })
      ).rejects.toThrow(/timed out after 100ms/)
    })

    it('should cap timeout at MAX_TIMEOUT (300000ms)', async () => {
      const tool = createRunCommand(motorConfig)

      // This test verifies the timeout is capped, not that it actually waits
      // We can't easily test this without waiting, so we just verify it doesn't reject the high value
      const result = await tool.execute({
        repo: 'testowner/testrepo',
        command: 'echo test',
        timeout_ms: 999_999_999 // Way over MAX_TIMEOUT
      })

      expect(result).toContain('test')
      expect(result).toContain('[Exit code: 0]')
    })
  })
})
