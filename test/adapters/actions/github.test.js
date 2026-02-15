import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import {
  createGitClone,
  createGitDiff,
  createGitCommit,
  createGitPush,
  createCreatePr,
  _git
} from '../../../src/adapters/actions/github.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('GitHub Actions', () => {
  describe('git_clone', () => {
    it('should have correct definition shape', () => {
      const motorConfig = { githubToken: 'test-token', workspacesDir: '/tmp' }
      const tool = createGitClone(motorConfig)

      expect(tool.definition).toMatchObject({
        name: 'git_clone',
        description: expect.any(String),
        input_schema: {
          type: 'object',
          properties: {
            repo: expect.any(Object),
            branch: expect.any(Object)
          },
          required: ['repo']
        }
      })
    })

    it('should throw when GITHUB_TOKEN is empty', async () => {
      const motorConfig = { githubToken: '', workspacesDir: '/tmp' }
      const tool = createGitClone(motorConfig)

      await expect(tool.execute({ repo: 'test-owner/test-repo' }))
        .rejects
        .toThrow('GITHUB_TOKEN not configured')
    })
  })

  describe('git_diff', () => {
    let tmpDir
    let workspacesDir
    let repoDir
    let motorConfig

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-test-'))
      workspacesDir = join(tmpDir, 'workspaces')
      repoDir = join(workspacesDir, 'test-owner', 'test-repo')

      // Create and initialize git repo
      execSync(`mkdir -p "${repoDir}"`, { encoding: 'utf8' })
      execSync(`git init`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git config user.email "test@test.com"`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git config user.name "Test"`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`touch .gitkeep`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git add .`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git commit -m "init"`, { cwd: repoDir, encoding: 'utf8' })

      motorConfig = { workspacesDir }
    })

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    it('should show "No changes detected." on clean repo', async () => {
      const tool = createGitDiff(motorConfig)
      const result = await tool.execute({ repo: 'test-owner/test-repo' })

      expect(result).toBe('No changes detected.')
    })

    it('should show changes when files are modified', async () => {
      const tool = createGitDiff(motorConfig)

      // Modify an existing file
      await writeFile(join(repoDir, '.gitkeep'), 'Modified content\n')

      const result = await tool.execute({ repo: 'test-owner/test-repo' })

      expect(result).toContain('Status:')
      expect(result).toContain('.gitkeep')
      expect(result).toContain('Unstaged changes:')
    })
  })

  describe('git_commit', () => {
    let tmpDir
    let workspacesDir
    let repoDir
    let motorConfig

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-test-'))
      workspacesDir = join(tmpDir, 'workspaces')
      repoDir = join(workspacesDir, 'test-owner', 'test-repo')

      // Create and initialize git repo
      execSync(`mkdir -p "${repoDir}"`, { encoding: 'utf8' })
      execSync(`git init`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git config user.email "test@test.com"`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git config user.name "Test"`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`touch .gitkeep`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git add .`, { cwd: repoDir, encoding: 'utf8' })
      execSync(`git commit -m "init"`, { cwd: repoDir, encoding: 'utf8' })

      motorConfig = { workspacesDir }
    })

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    it('should commit staged changes and return commit hash in output', async () => {
      const tool = createGitCommit(motorConfig)

      // Create a new file
      await writeFile(join(repoDir, 'feature.txt'), 'New feature\n')

      const result = await tool.execute({
        repo: 'test-owner/test-repo',
        message: 'feat: add new feature'
      })

      expect(result).toContain('Committed:')
      expect(result).toContain('feat: add new feature')

      // Verify commit exists
      const log = execSync(`git log --oneline -1`, { cwd: repoDir, encoding: 'utf8' })
      expect(log).toContain('feat: add new feature')
    })

    it('should reject commit containing AWS key pattern', async () => {
      const tool = createGitCommit(motorConfig)

      // Create a file with AWS secret (assembled to avoid pre-commit hook)
      const awsKey = 'AKIA' + 'IOSFODNN7EXAMPLE'
      await writeFile(join(repoDir, 'config.txt'), `AWS_KEY=${awsKey}\n`)

      await expect(tool.execute({
        repo: 'test-owner/test-repo',
        message: 'add config'
      }))
        .rejects
        .toThrow('Secret scan failed')

      await expect(tool.execute({
        repo: 'test-owner/test-repo',
        message: 'add config'
      }))
        .rejects
        .toThrow('AWS Access Key')
    })

    it('should reject commit containing GitHub token', async () => {
      const tool = createGitCommit(motorConfig)

      // Create a file with GitHub token (assembled to avoid pre-commit hook)
      const ghToken = 'gh' + 'p_' + 'x'.repeat(36)
      await writeFile(join(repoDir, 'secrets.txt'), `TOKEN=${ghToken}\n`)

      await expect(tool.execute({
        repo: 'test-owner/test-repo',
        message: 'add secrets'
      }))
        .rejects
        .toThrow('Secret scan failed')

      await expect(tool.execute({
        repo: 'test-owner/test-repo',
        message: 'add secrets'
      }))
        .rejects
        .toThrow('GitHub Token')
    })
  })

  describe('git_push', () => {
    it('should have correct definition shape', () => {
      const motorConfig = { githubToken: 'test-token', workspacesDir: '/tmp' }
      const tool = createGitPush(motorConfig)

      expect(tool.definition).toMatchObject({
        name: 'git_push',
        description: expect.any(String),
        input_schema: {
          type: 'object',
          properties: {
            repo: expect.any(Object)
          },
          required: ['repo']
        }
      })
    })

    it('should throw when GITHUB_TOKEN is empty', async () => {
      const motorConfig = { githubToken: '', workspacesDir: '/tmp' }
      const tool = createGitPush(motorConfig)

      await expect(tool.execute({ repo: 'test-owner/test-repo' }))
        .rejects
        .toThrow('GITHUB_TOKEN not configured')
    })
  })

  describe('create_pr', () => {
    let originalFetch

    beforeEach(() => {
      originalFetch = global.fetch
      global.fetch = vi.fn()
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('should send correct request to GitHub API', async () => {
      const motorConfig = { githubToken: 'test-token-123', workspacesDir: '/tmp' }
      const tool = createCreatePr(motorConfig)

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ number: 42, html_url: 'https://github.com/owner/repo/pull/42' })
      })

      await tool.execute({
        repo: 'owner/repo',
        title: 'Test PR',
        body: 'Test description',
        branch: 'feature-branch',
        base: 'main'
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'KenoBot/1.0'
          }),
          body: JSON.stringify({
            title: 'Test PR',
            body: 'Test description',
            head: 'feature-branch',
            base: 'main'
          })
        })
      )
    })

    it('should return PR URL on success', async () => {
      const motorConfig = { githubToken: 'test-token', workspacesDir: '/tmp' }
      const tool = createCreatePr(motorConfig)

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ number: 99, html_url: 'https://github.com/owner/repo/pull/99' })
      })

      const result = await tool.execute({
        repo: 'owner/repo',
        title: 'My PR',
        branch: 'my-branch'
      })

      expect(result).toBe('PR #99 created: https://github.com/owner/repo/pull/99')
    })

    it('should handle API errors (non-200 response)', async () => {
      const motorConfig = { githubToken: 'test-token', workspacesDir: '/tmp' }
      const tool = createCreatePr(motorConfig)

      global.fetch.mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ message: 'Validation failed' })
      })

      await expect(tool.execute({
        repo: 'owner/repo',
        title: 'Bad PR',
        branch: 'bad-branch'
      }))
        .rejects
        .toThrow('GitHub API error (422): Validation failed')
    })
  })
})
