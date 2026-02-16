import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import SelfImprover from '../../../../src/domain/cognitive/consolidation/self-improver.js'

describe('SelfImprover', () => {
  let improver
  let mockMemory
  let tempDir

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'self-improver-'))
    mockMemory = {}
    improver = new SelfImprover(mockMemory, { dataDir: tempDir })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('generateProposals', () => {
    it('should return empty array when sleep results are normal', () => {
      const proposals = improver.generateProposals({
        consolidation: { episodesProcessed: 5, patternsAdded: 2, factsAdded: 1 },
        errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
        pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
      })

      expect(proposals).toEqual([])
    })

    it('should propose when many episodes yield no patterns', () => {
      const proposals = improver.generateProposals({
        consolidation: { episodesProcessed: 15, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
        pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
      })

      expect(proposals.length).toBeGreaterThan(0)
      expect(proposals[0].priority).toBe('medium')
      expect(proposals[0].observation).toContain('15 episodes')
    })

    it('should propose when many errors found', () => {
      const proposals = improver.generateProposals({
        consolidation: { episodesProcessed: 5, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 5, lessonsExtracted: 2 },
        pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
      })

      const errorProposal = proposals.find(p => p.priority === 'high')
      expect(errorProposal).toBeTruthy()
      expect(errorProposal.observation).toContain('5 errors')
    })

    it('should propose when many working memory sessions pruned', () => {
      const proposals = improver.generateProposals({
        consolidation: { episodesProcessed: 0, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
        pruning: { workingPruned: 10, episodesCompressed: 0, patternsPruned: 0 }
      })

      const pruneProposal = proposals.find(p => p.observation.includes('stale working memory'))
      expect(pruneProposal).toBeTruthy()
      expect(pruneProposal.priority).toBe('low')
    })

    it('should propose when many patterns pruned', () => {
      const proposals = improver.generateProposals({
        consolidation: { episodesProcessed: 0, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
        pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 5 }
      })

      const patternProposal = proposals.find(p => p.observation.includes('procedural patterns'))
      expect(patternProposal).toBeTruthy()
    })

    it('should propose when system is completely idle', () => {
      const proposals = improver.generateProposals({
        consolidation: { episodesProcessed: 0, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
        pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
      })

      expect(proposals.length).toBe(1)
      expect(proposals[0].observation).toContain('nothing to process')
    })

    it('should handle missing sleep results gracefully', () => {
      const proposals = improver.generateProposals({})

      expect(proposals.length).toBe(1) // idle proposal
    })

    it('should handle undefined sleep results', () => {
      const proposals = improver.generateProposals()

      expect(proposals.length).toBe(1) // idle proposal
    })
  })

  describe('run', () => {
    it('should return proposals count', async () => {
      const result = await improver.run({
        consolidation: { episodesProcessed: 0, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 0, lessonsExtracted: 0 },
        pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
      })

      expect(result).toHaveProperty('proposalsGenerated')
      expect(result.proposalsGenerated).toBe(1)
    })

    it('should write proposals to disk when dataDir is set', async () => {
      await improver.run({
        consolidation: { episodesProcessed: 0, patternsAdded: 0, factsAdded: 0 },
        errorAnalysis: { errorsFound: 5, lessonsExtracted: 2 },
        pruning: { workingPruned: 0, episodesCompressed: 0, patternsPruned: 0 }
      })

      const proposalDir = join(tempDir, 'sleep', 'proposals')
      const files = await readdir(proposalDir)
      expect(files.length).toBe(1)

      const content = await readFile(join(proposalDir, files[0]), 'utf8')
      expect(content).toContain('Sleep Cycle Proposals')
      expect(content).toContain('Observation')
    })

    it('should not write when no dataDir', async () => {
      const noDirImprover = new SelfImprover(mockMemory, {})

      const result = await noDirImprover.run({
        errorAnalysis: { errorsFound: 5 }
      })

      expect(result.proposalsGenerated).toBeGreaterThan(0)
      // No files written — just generated
    })
  })

  describe('listProposals', () => {
    it('should return empty array when no proposals exist', async () => {
      const proposals = await improver.listProposals()

      expect(proposals).toEqual([])
    })

    it('should list proposals after writing', async () => {
      await improver.run({
        errorAnalysis: { errorsFound: 5 }
      })

      const proposals = await improver.listProposals()

      expect(proposals.length).toBe(1)
      expect(proposals[0].content).toContain('Proposals')
    })

    it('should return empty when no dataDir', async () => {
      const noDirImprover = new SelfImprover(mockMemory, {})
      const proposals = await noDirImprover.listProposals()

      expect(proposals).toEqual([])
    })
  })
})
