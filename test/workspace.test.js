import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initWorkspace } from '../src/workspace.js'

vi.mock('../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import logger from '../src/logger.js'

describe('initWorkspace', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-workspace-'))
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should create workspace directory and subdirectories', async () => {
    const wsDir = join(tmpDir, 'workspace')

    await initWorkspace(wsDir)

    // Check subdirectories created
    const subdirs = ['skills', 'workflows', 'notes', 'identity', 'staging/skills', 'staging/workflows', 'staging/identity']
    for (const sub of subdirs) {
      await expect(access(join(wsDir, sub))).resolves.toBeUndefined()
    }
  })

  it('should log info when no git repo found', async () => {
    const wsDir = join(tmpDir, 'workspace')

    await initWorkspace(wsDir)

    expect(logger.info).toHaveBeenCalledWith('workspace', 'no_git_repo', expect.objectContaining({
      dir: wsDir
    }))
  })

  it('should warn when git repo has no remote', async () => {
    const wsDir = join(tmpDir, 'workspace')
    await mkdir(wsDir, { recursive: true })

    // Create a bare git repo without remote
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    await execFileAsync('git', ['init'], { cwd: wsDir })

    await initWorkspace(wsDir)

    expect(logger.warn).toHaveBeenCalledWith('workspace', 'no_remote', expect.objectContaining({
      dir: wsDir
    }))
  })

  it('should be idempotent', async () => {
    const wsDir = join(tmpDir, 'workspace')

    await initWorkspace(wsDir)
    await initWorkspace(wsDir) // second call should not fail

    await expect(access(join(wsDir, 'skills'))).resolves.toBeUndefined()
  })
})
