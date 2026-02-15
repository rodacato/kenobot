import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

function makePaths(home) {
  return {
    home,
    data: join(home, 'data'),
    config: join(home, 'config'),
    envFile: join(home, 'config', '.env'),
  }
}

function captureConsole() {
  const logs = []
  const origLog = console.log
  console.log = (...args) => logs.push(args.join(' '))
  return {
    logs,
    restore: () => { console.log = origLog }
  }
}

describe('sleep CLI command', () => {
  let tmpDir, paths

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-sleep-test-'))
    paths = makePaths(tmpDir)
    await mkdir(join(paths.home, 'data', 'memory'), { recursive: true })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should run sleep cycle and print results', async () => {
    const { default: sleep } = await import('../../src/cli/sleep.js')
    const { logs, restore } = captureConsole()

    try {
      await sleep([], paths)
    } finally {
      restore()
    }

    const output = logs.join('\n')
    expect(output).toContain('Running sleep cycle')
    expect(output).toContain('Sleep cycle completed')
    expect(output).toContain('Consolidation')
    expect(output).toContain('Error Analysis')
    expect(output).toContain('Pruning')
    expect(output).toContain('Self-Improvement')
  })

  it('should show status with --status flag', async () => {
    const { default: sleep } = await import('../../src/cli/sleep.js')
    const { logs, restore } = captureConsole()

    try {
      await sleep(['--status'], paths)
    } finally {
      restore()
    }

    const output = logs.join('\n')
    expect(output).toContain('Sleep Cycle Status')
    expect(output).toContain('Status:')
    expect(output).toContain('Last run:')
    expect(output).toContain('Should run:')
  })

  it('should show proposals with --proposals flag', async () => {
    const { default: sleep } = await import('../../src/cli/sleep.js')
    const { logs, restore } = captureConsole()

    try {
      await sleep(['--proposals'], paths)
    } finally {
      restore()
    }

    const output = logs.join('\n')
    expect(output).toContain('No proposals found')
  })
})
