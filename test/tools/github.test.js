import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import GitHubTool from '../../src/tools/github.js'

const execFileAsync = promisify(execFile)

describe('GitHubTool', () => {
  let tmpDir, tool

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-git-tool-'))
    // Initialize a git repo
    await execFileAsync('git', ['init'], { cwd: tmpDir })
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir })
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir })
    // Create initial commit
    await writeFile(join(tmpDir, 'README.md'), '# Test')
    await execFileAsync('git', ['add', '.'], { cwd: tmpDir })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: tmpDir })

    tool = new GitHubTool(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('definition', () => {
    it('should have correct name and schema', () => {
      const def = tool.definition
      expect(def.name).toBe('github')
      expect(def.input_schema.properties.action).toBeDefined()
      expect(def.input_schema.properties.files).toBeDefined()
      expect(def.input_schema.properties.message).toBeDefined()
    })
  })

  describe('trigger', () => {
    it('should match /git commands', () => {
      expect(tool.trigger.test('/git status')).toBe(true)
      expect(tool.trigger.test('/git push')).toBe(true)
      expect(tool.trigger.test('/git log')).toBe(true)
      expect(tool.trigger.test('/GIT STATUS')).toBe(true)
    })

    it('should parse commit trigger with message', () => {
      const match = '/git commit fix typo'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('commit')
      expect(input.message).toBe('fix typo')
    })

    it('should default commit message', () => {
      const match = '/git commit '.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('commit')
      expect(input.message).toBe('auto-commit')
    })
  })

  describe('status', () => {
    it('should return clean status', async () => {
      const result = await tool.execute({ action: 'status' })
      expect(result).toBe('(clean)')
    })

    it('should show modified files', async () => {
      await writeFile(join(tmpDir, 'README.md'), '# Modified')

      const result = await tool.execute({ action: 'status' })
      expect(result).toContain('README.md')
    })
  })

  describe('commit', () => {
    it('should commit staged files', async () => {
      await writeFile(join(tmpDir, 'new-file.md'), 'hello')

      const result = await tool.execute({
        action: 'commit',
        files: ['new-file.md'],
        message: 'add new file'
      })

      expect(result).toContain('add new file')
    })

    it('should reject commit without message', async () => {
      await expect(tool.execute({ action: 'commit' })).rejects.toThrow('message is required')
    })
  })

  describe('log', () => {
    it('should show commit history', async () => {
      const result = await tool.execute({ action: 'log' })
      expect(result).toContain('init')
    })
  })

  describe('pull', () => {
    it('should fail gracefully without remote', async () => {
      await expect(tool.execute({ action: 'pull' })).rejects.toThrow()
    })
  })

  describe('push', () => {
    it('should fail gracefully without remote', async () => {
      await expect(tool.execute({ action: 'push' })).rejects.toThrow()
    })
  })

  describe('unknown action', () => {
    it('should throw on unknown action', async () => {
      await expect(tool.execute({ action: 'rebase' })).rejects.toThrow('Unknown action')
    })
  })
})
