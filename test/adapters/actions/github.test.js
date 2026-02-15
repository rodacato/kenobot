import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createGithubSetupWorkspace } from '../../../src/adapters/actions/github.js'
import { generatePreCommitHook } from '../../../src/domain/immune/secret-scanner.js'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('GitHub Actions', () => {
  describe('github_setup_workspace', () => {
    it('should have correct definition shape', () => {
      const motorConfig = { workspacesDir: '/tmp', githubUsername: 'testuser' }
      const tool = createGithubSetupWorkspace(motorConfig)

      expect(tool.definition).toMatchObject({
        name: 'github_setup_workspace',
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

    it('should mention run_command in description', () => {
      const motorConfig = { workspacesDir: '/tmp', githubUsername: 'testuser' }
      const tool = createGithubSetupWorkspace(motorConfig)

      expect(tool.definition.description).toContain('run_command')
    })
  })

  describe('pre-commit hook installation', () => {
    let tmpDir
    let workspacesDir
    let repoDir
    let remoteDir
    let motorConfig

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-test-'))
      workspacesDir = join(tmpDir, 'workspaces')
      repoDir = join(workspacesDir, 'test-owner', 'test-repo')

      // Create a local bare "remote" repo
      remoteDir = join(tmpDir, 'remote')
      execSync(`mkdir -p "${remoteDir}"`, { encoding: 'utf8' })
      execSync('git init --bare', { cwd: remoteDir, encoding: 'utf8' })

      // Seed it with a commit
      const seedDir = join(tmpDir, 'seed')
      execSync(`mkdir -p "${seedDir}"`, { encoding: 'utf8' })
      execSync('git init', { cwd: seedDir, encoding: 'utf8' })
      execSync('git config user.email "test@test.com"', { cwd: seedDir, encoding: 'utf8' })
      execSync('git config user.name "Test"', { cwd: seedDir, encoding: 'utf8' })
      execSync('touch .gitkeep', { cwd: seedDir, encoding: 'utf8' })
      execSync('git add .', { cwd: seedDir, encoding: 'utf8' })
      execSync('git commit -m "init"', { cwd: seedDir, encoding: 'utf8' })
      execSync(`git remote add origin "${remoteDir}"`, { cwd: seedDir, encoding: 'utf8' })
      execSync('git push -u origin master', { cwd: seedDir, encoding: 'utf8' })

      motorConfig = { workspacesDir, githubUsername: 'testbot' }
    })

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    it('should install pre-commit hook when workspace already exists', async () => {
      // Clone the repo locally to simulate an existing workspace
      execSync(`mkdir -p "${join(workspacesDir, 'test-owner')}"`, { encoding: 'utf8' })
      execSync(`git clone "${remoteDir}" "${repoDir}"`, { encoding: 'utf8' })

      const hookPath = join(repoDir, '.git', 'hooks', 'pre-commit')

      // Verify hook doesn't exist yet
      await expect(stat(hookPath)).rejects.toThrow()

      const tool = createGithubSetupWorkspace(motorConfig)
      await tool.execute({ repo: 'test-owner/test-repo' })

      // Verify hook was installed
      const hookContent = await readFile(hookPath, 'utf8')
      expect(hookContent).toContain('KenoBot secret scanner')
      expect(hookContent).toContain('AKIA')
      expect(hookContent).toContain('GitHub Token')
      expect(hookContent).toContain('Private Key')

      // Verify hook is executable
      const hookStat = await stat(hookPath)
      const mode = hookStat.mode & 0o777
      expect(mode & 0o100).toBeTruthy() // owner execute bit
    })

    it('should return workspace path in result', async () => {
      // Clone the repo locally to simulate an existing workspace
      execSync(`mkdir -p "${join(workspacesDir, 'test-owner')}"`, { encoding: 'utf8' })
      execSync(`git clone "${remoteDir}" "${repoDir}"`, { encoding: 'utf8' })

      const tool = createGithubSetupWorkspace(motorConfig)
      const result = await tool.execute({ repo: 'test-owner/test-repo' })

      expect(result).toContain('Updated test-owner/test-repo')
      expect(result).toContain('Workspace:')
      expect(result).toContain(repoDir)
    })
  })

  describe('pre-commit hook content (from immune system)', () => {
    it('should contain all secret patterns', () => {
      const hook = generatePreCommitHook()
      expect(hook).toContain('AKIA[0-9A-Z]{16}')
      expect(hook).toContain('gh[ps]_[A-Za-z0-9_]{36,}')
      expect(hook).toContain('github_pat_[A-Za-z0-9_]{22,}')
      expect(hook).toContain('PRIVATE KEY')
      expect(hook).toContain('secret|password|token|key')
    })

    it('should be a valid shell script', () => {
      const hook = generatePreCommitHook()
      expect(hook).toMatch(/^#!\/bin\/sh/)
    })

    it('should use git diff --cached for scanning', () => {
      const hook = generatePreCommitHook()
      expect(hook).toContain('git diff --cached')
    })
  })
})
