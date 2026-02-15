import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import NervousSystem from '../../../../src/domain/nervous/index.js'
import { APPROVAL_PROPOSED } from '../../../../src/infrastructure/events.js'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import SelfImprover from '../../../../src/domain/cognitive/consolidation/self-improver.js'

// Sleep results that trigger a high-priority proposal (>3 errors)
const HIGH_PRIORITY_RESULTS = {
  consolidation: { episodesProcessed: 5, patternsAdded: 1, factsAdded: 1 },
  errorAnalysis: { errorsFound: 5, lessonsExtracted: 2 },
  pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
}

// Sleep results that trigger only low-priority proposals
const LOW_PRIORITY_RESULTS = {
  consolidation: { episodesProcessed: 0, patternsAdded: 0, factsAdded: 0 },
  errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
  pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
}

function createMockToolRegistry() {
  const calls = []
  return {
    calls,
    async executeTool(name, input) {
      calls.push({ name, input })
      if (name === 'run_command' && input.command?.includes('gh pr create')) {
        return { result: 'https://github.com/owner/repo/pull/42', isError: false }
      }
      return { result: `ok: ${name}`, isError: false }
    }
  }
}

describe('SelfImprover — Motor System integration', () => {
  let tempDir
  let mockMemory

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'self-improver-motor-'))
    mockMemory = {}
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('PR creation via toolRegistry', () => {
    it('should create PR when toolRegistry and repo are available', async () => {
      const toolRegistry = createMockToolRegistry()
      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        toolRegistry,
        repo: 'owner/kenobot'
      })

      const result = await improver.run(HIGH_PRIORITY_RESULTS)

      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42')
      expect(result.proposalsGenerated).toBeGreaterThan(0)

      // Verify tool call sequence
      const toolNames = toolRegistry.calls.map(c => c.name)
      expect(toolNames).toEqual([
        'github_setup_workspace',
        'write_file',
        'run_command',  // git add + commit
        'run_command',  // git push
        'run_command'   // gh pr create
      ])
    })

    it('should pass correct repo and branch to github_setup_workspace', async () => {
      const toolRegistry = createMockToolRegistry()
      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        toolRegistry,
        repo: 'owner/kenobot'
      })

      await improver.run(HIGH_PRIORITY_RESULTS)

      const setupCall = toolRegistry.calls.find(c => c.name === 'github_setup_workspace')
      expect(setupCall.input.repo).toBe('owner/kenobot')
      expect(setupCall.input.branch).toMatch(/^improve\/\d{4}-\d{2}-\d{2}-/)
    })

    it('should write proposals markdown via write_file', async () => {
      const toolRegistry = createMockToolRegistry()
      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        toolRegistry,
        repo: 'owner/kenobot'
      })

      await improver.run(HIGH_PRIORITY_RESULTS)

      const writeCall = toolRegistry.calls.find(c => c.name === 'write_file')
      expect(writeCall.input.repo).toBe('owner/kenobot')
      expect(writeCall.input.path).toMatch(/^docs\/proposals\/\d{4}-\d{2}-\d{2}\.md$/)
      expect(writeCall.input.content).toContain('Improvement Proposals')
      expect(writeCall.input.content).toContain('errors found')
    })

    it('should skip PR creation when toolRegistry is not available', async () => {
      const improver = new SelfImprover(mockMemory, { dataDir: tempDir })

      const result = await improver.run(HIGH_PRIORITY_RESULTS)

      expect(result.prUrl).toBeNull()
      expect(result.proposalsGenerated).toBeGreaterThan(0)
    })

    it('should skip PR creation when repo is not configured', async () => {
      const toolRegistry = createMockToolRegistry()
      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        toolRegistry
        // no repo
      })

      const result = await improver.run(HIGH_PRIORITY_RESULTS)

      expect(result.prUrl).toBeNull()
      expect(toolRegistry.calls.length).toBe(0)
    })

    it('should handle tool errors gracefully and return null prUrl', async () => {
      const toolRegistry = {
        async executeTool() {
          return { result: 'git clone failed', isError: true }
        }
      }
      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        toolRegistry,
        repo: 'owner/kenobot'
      })

      const result = await improver.run(HIGH_PRIORITY_RESULTS)

      expect(result.prUrl).toBeNull()
      expect(result.proposalsGenerated).toBeGreaterThan(0)
    })

    it('should still write proposals to disk even when PR creation fails', async () => {
      const toolRegistry = {
        async executeTool() {
          return { result: 'network error', isError: true }
        }
      }
      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        toolRegistry,
        repo: 'owner/kenobot'
      })

      await improver.run(HIGH_PRIORITY_RESULTS)

      const proposalDir = join(tempDir, 'sleep', 'proposals')
      const files = await readdir(proposalDir)
      expect(files.length).toBe(1)
    })
  })

  describe('approval signal via bus', () => {
    it('should fire approval:proposed when proposals are generated', async () => {
      const bus = new NervousSystem({})
      const fired = []
      bus.on(APPROVAL_PROPOSED, (payload) => fired.push(payload))

      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        bus
      })

      await improver.run(HIGH_PRIORITY_RESULTS)

      expect(fired.length).toBe(1)
      expect(fired[0].type).toBe('self-improvement')
      expect(fired[0].proposalCount).toBeGreaterThan(0)
      expect(fired[0].priorities).toContain('high')
      expect(fired[0].prUrl).toBeNull()
    })

    it('should include PR URL in approval signal when PR is created', async () => {
      const bus = new NervousSystem({})
      const toolRegistry = createMockToolRegistry()
      const fired = []
      bus.on(APPROVAL_PROPOSED, (payload) => fired.push(payload))

      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        bus,
        toolRegistry,
        repo: 'owner/kenobot'
      })

      await improver.run(HIGH_PRIORITY_RESULTS)

      expect(fired.length).toBe(1)
      expect(fired[0].prUrl).toBe('https://github.com/owner/repo/pull/42')
    })

    it('should not fire approval signal when no proposals are generated', async () => {
      const bus = new NervousSystem({})
      const fired = []
      bus.on(APPROVAL_PROPOSED, (payload) => fired.push(payload))

      const improver = new SelfImprover(mockMemory, {
        dataDir: tempDir,
        bus
      })

      // Normal results that don't trigger proposals
      await improver.run({
        consolidation: { episodesProcessed: 5, patternsAdded: 2 },
        errorAnalysis: { errorsFound: 0 },
        pruning: { workingPruned: 0, patternsPruned: 0 }
      })

      expect(fired.length).toBe(0)
    })

    it('should not fire approval signal when bus is not available', async () => {
      const improver = new SelfImprover(mockMemory, { dataDir: tempDir })

      // Should not throw even without bus
      const result = await improver.run(HIGH_PRIORITY_RESULTS)
      expect(result.proposalsGenerated).toBeGreaterThan(0)
    })
  })

  describe('_slugify', () => {
    it('should create URL-safe slug', () => {
      const improver = new SelfImprover(mockMemory, {})
      expect(improver._slugify('5 errors found in recent logs')).toBe('5-errors-found-in-recent-logs')
    })

    it('should truncate long text', () => {
      const improver = new SelfImprover(mockMemory, {})
      const long = 'a'.repeat(100)
      expect(improver._slugify(long).length).toBeLessThanOrEqual(40)
    })

    it('should remove leading/trailing hyphens', () => {
      const improver = new SelfImprover(mockMemory, {})
      expect(improver._slugify('---hello---')).toBe('hello')
    })
  })

  describe('_formatProposalMarkdown', () => {
    it('should format proposals as readable markdown', () => {
      const improver = new SelfImprover(mockMemory, {})
      const proposals = [
        { observation: 'Test observation', suggestion: 'Test suggestion', evidence: 'Test evidence', priority: 'high' }
      ]

      const md = improver._formatProposalMarkdown(proposals, '2026-02-15')

      expect(md).toContain('# Improvement Proposals — 2026-02-15')
      expect(md).toContain('Test observation (high)')
      expect(md).toContain('**Suggestion:** Test suggestion')
      expect(md).toContain('**Evidence:** Test evidence')
    })
  })
})
