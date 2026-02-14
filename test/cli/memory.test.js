import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../src/logger.js', () => ({
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

describe('memory CLI command', () => {
  let tmpDir, paths

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-memory-test-'))
    paths = makePaths(tmpDir)
    await mkdir(join(paths.home, 'data', 'memory'), { recursive: true })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('should show memory stats', async () => {
    const { default: memory } = await import('../../src/cli/memory.js')
    const { logs, restore } = captureConsole()

    try {
      await memory([], paths)
    } finally {
      restore()
    }

    const output = logs.join('\n')
    expect(output).toContain('Memory Statistics')
    expect(output).toContain('Semantic')
    expect(output).toContain('Working Memory')
    expect(output).toContain('Procedural')
  })

  it('should show stats with existing memory data', async () => {
    // Create a MEMORY.md file
    await writeFile(
      join(paths.home, 'data', 'memory', 'MEMORY.md'),
      '- User prefers dark mode\n- User likes coffee\n',
      'utf8'
    )

    const { default: memory } = await import('../../src/cli/memory.js')
    const { logs, restore } = captureConsole()

    try {
      await memory([], paths)
    } finally {
      restore()
    }

    const output = logs.join('\n')
    expect(output).toContain('Memory Statistics')
    expect(output).toContain('Semantic')
  })

  it('should run health check with --health flag', async () => {
    const { default: memory } = await import('../../src/cli/memory.js')
    const { logs, restore } = captureConsole()

    try {
      await memory(['--health'], paths)
    } finally {
      restore()
    }

    const output = logs.join('\n')
    expect(output).toContain('Memory Health Check')
    expect(output).toContain('Status:')
  })

  it('should run pruner with --prune flag', async () => {
    const { default: memory } = await import('../../src/cli/memory.js')
    const { logs, restore } = captureConsole()

    try {
      await memory(['--prune'], paths)
    } finally {
      restore()
    }

    const output = logs.join('\n')
    expect(output).toContain('Running memory pruner')
    expect(output).toContain('Working memory pruned:')
    expect(output).toContain('Patterns pruned:')
  })
})
