import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { join } from 'node:path'

// Use vi.hoisted so mocks are available in vi.mock factories
const { mockExecFile, mockWriteFile, mockAccess, mockMkdir } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockAccess: vi.fn(),
  mockMkdir: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('node:child_process', () => ({
  execFile: mockExecFile
}))

vi.mock('node:fs/promises', () => ({
  writeFile: (...args) => mockWriteFile(...args),
  access: (...args) => mockAccess(...args),
  mkdir: (...args) => mockMkdir(...args)
}))

vi.mock('../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ConfigSync from '../src/config-sync.js'

describe('ConfigSync', () => {
  let configSync
  const homeDir = '/home/test/.kenobot'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Default: execFile resolves with empty stdout/stderr
    mockExecFile.mockImplementation((cmd, args, opts, cb) => {
      if (typeof opts === 'function') {
        cb = opts
        opts = {}
      }
      cb(null, { stdout: '', stderr: '' })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should set default values', () => {
      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })

      expect(configSync.homeDir).toBe(homeDir)
      expect(configSync.repoUrl).toBe('git@github.com:user/repo.git')
      expect(configSync.debounceMs).toBe(30000)
    })

    it('should accept custom debounceMs', () => {
      configSync = new ConfigSync(homeDir, {
        repoUrl: 'git@github.com:user/repo.git',
        debounceMs: 5000
      })

      expect(configSync.debounceMs).toBe(5000)
    })

    it('should default sshKeyPath to empty string', () => {
      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })

      expect(configSync.sshKeyPath).toBe('')
    })
  })

  describe('init', () => {
    it('should no-op when repoUrl is not set', async () => {
      configSync = new ConfigSync(homeDir, {})

      await configSync.init()

      expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('should initialize git repo when .git does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'))

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })
      await configSync.init()

      // Should have called git init
      const initCall = mockExecFile.mock.calls.find(
        call => call[0] === 'git' && call[1].includes('init')
      )
      expect(initCall).toBeDefined()
    })

    it('should skip git init when .git already exists', async () => {
      mockAccess.mockResolvedValue(undefined)

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })
      await configSync.init()

      const initCall = mockExecFile.mock.calls.find(
        call => call[0] === 'git' && call[1][0] === 'init'
      )
      expect(initCall).toBeUndefined()
    })

    it('should set remote to repoUrl', async () => {
      mockAccess.mockResolvedValue(undefined)
      // remote get-url fails (no remote yet)
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (args.includes('get-url')) {
          cb(new Error('No such remote'))
          return
        }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })
      await configSync.init()

      const addRemote = mockExecFile.mock.calls.find(
        call => call[0] === 'git' && call[1][0] === 'remote' && call[1][1] === 'add'
      )
      expect(addRemote).toBeDefined()
      expect(addRemote[1]).toEqual(['remote', 'add', 'origin', 'git@github.com:user/repo.git'])
    })
  })

  describe('schedule', () => {
    it('should no-op when repoUrl is not set', () => {
      configSync = new ConfigSync(homeDir, {})

      configSync.schedule('test')

      expect(configSync._timer).toBeNull()
    })

    it('should debounce sync calls', () => {
      configSync = new ConfigSync(homeDir, {
        repoUrl: 'git@github.com:user/repo.git',
        debounceMs: 1000
      })

      configSync.schedule('first')
      configSync.schedule('second')
      configSync.schedule('third')

      // Timer should be set but sync hasn't happened yet
      expect(configSync._timer).not.toBeNull()
    })

    it('should trigger sync after debounce period', async () => {
      // Return "M file.md" for status, empty for everything else
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (args.includes('--porcelain')) {
          cb(null, { stdout: 'M file.md', stderr: '' })
          return
        }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, {
        repoUrl: 'git@github.com:user/repo.git',
        debounceMs: 1000
      })

      configSync.schedule('test change')

      await vi.advanceTimersByTimeAsync(1000)

      // Should have called git status, add, commit, push
      const gitCalls = mockExecFile.mock.calls.filter(c => c[0] === 'git')
      const statusCall = gitCalls.find(c => c[1].includes('--porcelain'))
      const addCall = gitCalls.find(c => c[1][0] === 'add')
      const commitCall = gitCalls.find(c => c[1][0] === 'commit')
      const pushCall = gitCalls.find(c => c[1][0] === 'push')

      expect(statusCall).toBeDefined()
      expect(addCall).toBeDefined()
      expect(commitCall).toBeDefined()
      expect(pushCall).toBeDefined()
    })
  })

  describe('flush', () => {
    it('should no-op when repoUrl is not set', async () => {
      configSync = new ConfigSync(homeDir, {})

      await configSync.flush()

      expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('should clear pending timer and sync immediately', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (args.includes('--porcelain')) {
          cb(null, { stdout: 'M file.md', stderr: '' })
          return
        }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, {
        repoUrl: 'git@github.com:user/repo.git',
        debounceMs: 30000
      })

      configSync.schedule('pending change')
      expect(configSync._timer).not.toBeNull()

      await configSync.flush()

      expect(configSync._timer).toBeNull()
    })

    it('should skip sync when no changes', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })

      await configSync.flush()

      // Should have called status but not commit
      const commitCall = mockExecFile.mock.calls.find(
        c => c[0] === 'git' && c[1][0] === 'commit'
      )
      expect(commitCall).toBeUndefined()
    })
  })

  describe('stop', () => {
    it('should clear pending timer', () => {
      configSync = new ConfigSync(homeDir, {
        repoUrl: 'git@github.com:user/repo.git'
      })

      configSync.schedule('pending')
      expect(configSync._timer).not.toBeNull()

      configSync.stop()
      expect(configSync._timer).toBeNull()
    })
  })

  describe('_sync', () => {
    it('should use SSH key when sshKeyPath is set', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (args.includes('--porcelain')) {
          cb(null, { stdout: 'M file.md', stderr: '' })
          return
        }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, {
        repoUrl: 'git@github.com:user/repo.git',
        sshKeyPath: '/home/test/.ssh/id_ed25519'
      })

      await configSync.flush()

      // Check that GIT_SSH_COMMAND was set in at least one call
      const callWithSsh = mockExecFile.mock.calls.find(
        c => c[2]?.env?.GIT_SSH_COMMAND?.includes('/home/test/.ssh/id_ed25519')
      )
      expect(callWithSsh).toBeDefined()
    })

    it('should not sync if already syncing', async () => {
      let resolveFirst
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (args.includes('--porcelain')) {
          // First call hangs, subsequent calls resolve immediately
          if (!resolveFirst) {
            resolveFirst = cb
            return
          }
          cb(null, { stdout: 'M file.md', stderr: '' })
          return
        }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })

      // Start first sync (will hang on status check)
      const firstSync = configSync.flush()

      // Second sync should be rejected (already syncing)
      const secondSync = configSync.flush()

      // Resolve the first sync
      resolveFirst(null, { stdout: '', stderr: '' })

      await firstSync
      await secondSync

      // Only one status check should have been made (the second was blocked)
      const statusCalls = mockExecFile.mock.calls.filter(
        c => c[0] === 'git' && c[1].includes('--porcelain')
      )
      expect(statusCalls).toHaveLength(1)
    })

    it('should handle nothing-to-commit gracefully', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (args.includes('--porcelain')) {
          cb(null, { stdout: 'M file.md', stderr: '' })
          return
        }
        if (args[0] === 'commit') {
          cb(new Error('nothing to commit'))
          return
        }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })

      // Should not throw
      await expect(configSync.flush()).resolves.toBeUndefined()
    })

    it('should log warning on sync failure', async () => {
      const { default: logger } = await import('../src/logger.js')

      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof opts === 'function') { cb = opts; opts = {} }
        if (args.includes('--porcelain')) {
          cb(null, { stdout: 'M file.md', stderr: '' })
          return
        }
        if (args[0] === 'push') {
          cb(new Error('remote: Permission denied'))
          return
        }
        cb(null, { stdout: '', stderr: '' })
      })

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })

      await configSync.flush()

      expect(logger.warn).toHaveBeenCalledWith(
        'config-sync', 'sync_failed',
        expect.objectContaining({ reason: expect.any(String) })
      )
    })
  })

  describe('_ensureGitignore', () => {
    it('should create .gitignore when missing', async () => {
      mockAccess.mockImplementation((path) => {
        if (path.endsWith('.gitignore')) return Promise.reject(new Error('ENOENT'))
        return Promise.resolve()
      })

      configSync = new ConfigSync(homeDir, { repoUrl: 'git@github.com:user/repo.git' })
      await configSync.init()

      const writeCall = mockWriteFile.mock.calls.find(
        c => c[0].endsWith('.gitignore')
      )
      expect(writeCall).toBeDefined()
      expect(writeCall[1]).toContain('config/.env')
    })
  })
})
