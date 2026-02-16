import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import IntegrityChecker from '../../../src/domain/immune/integrity-checker.js'

describe('IntegrityChecker', () => {
  let tempDir
  let identityPath

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'integrity-checker-'))
    identityPath = join(tempDir, 'identity')
    await mkdir(identityPath, { recursive: true })

    // Write rules.json with forbidden patterns
    await writeFile(join(identityPath, 'rules.json'), JSON.stringify({
      rules: [
        {
          id: 'no_filler',
          instruction: 'Skip filler phrases',
          forbidden_patterns: ['Great question', "I'd be happy to help", 'Sure thing']
        },
        {
          id: 'honest_feedback',
          instruction: 'Be direct',
          examples: []
        }
      ]
    }))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('check', () => {
    it('should return no drift for clean responses', async () => {
      const checker = new IntegrityChecker(identityPath)

      const result = await checker.check([
        'Use PostgreSQL for that workload.',
        'apt install nodejs',
        'The bug is in line 42.'
      ])

      expect(result.driftDetected).toBe(false)
      expect(result.score).toBe(0)
      expect(result.findings).toEqual([])
    })

    it('should detect forbidden patterns in responses', async () => {
      const checker = new IntegrityChecker(identityPath)

      const result = await checker.check([
        'Great question! Let me explain...',
        "I'd be happy to help with that!"
      ])

      expect(result.findings.length).toBeGreaterThan(0)
      expect(result.findings[0].type).toBe('forbidden_pattern')
      expect(result.findings[0].rule).toBe('no_filler')
    })

    it('should detect multiple violations across responses', async () => {
      const checker = new IntegrityChecker(identityPath)

      const result = await checker.check([
        'Great question! Sure thing!',
        "I'd be happy to help you with that."
      ])

      // Should find multiple forbidden patterns
      expect(result.findings.length).toBeGreaterThanOrEqual(3)
      expect(result.score).toBeGreaterThan(0)
    })

    it('should flag drift when many violations found', async () => {
      const checker = new IntegrityChecker(identityPath)

      // 2+ violations = score >= 0.4 = drift detected
      const result = await checker.check([
        'Great question! Sure thing!',
        "I'd be happy to help! Great question!"
      ])

      expect(result.driftDetected).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(0.4)
    })

    it('should detect verbosity drift for long responses', async () => {
      const checker = new IntegrityChecker(identityPath)
      const longResponse = 'x'.repeat(3000)

      const result = await checker.check([longResponse, longResponse, longResponse])

      const styleFinding = result.findings.find(f => f.type === 'style_drift')
      expect(styleFinding).toBeTruthy()
      expect(styleFinding.severity).toBe('low')
    })

    it('should not flag verbosity for fewer than 3 responses', async () => {
      const checker = new IntegrityChecker(identityPath)
      const longResponse = 'x'.repeat(3000)

      const result = await checker.check([longResponse, longResponse])

      const styleFinding = result.findings.find(f => f.type === 'style_drift')
      expect(styleFinding).toBeFalsy()
    })

    it('should handle empty responses array', async () => {
      const checker = new IntegrityChecker(identityPath)

      const result = await checker.check([])

      expect(result.driftDetected).toBe(false)
      expect(result.score).toBe(0)
      expect(result.findings).toEqual([])
    })

    it('should handle missing rules.json gracefully', async () => {
      const checker = new IntegrityChecker(join(tempDir, 'nonexistent'))

      const result = await checker.check(['Great question!'])

      expect(result.driftDetected).toBe(false)
      expect(result.score).toBe(0)
      expect(result.findings).toEqual([])
    })

    it('should handle rules without forbidden_patterns', async () => {
      await writeFile(join(identityPath, 'rules.json'), JSON.stringify({
        rules: [
          { id: 'adaptive_language', instruction: 'Match language' }
        ]
      }))

      const checker = new IntegrityChecker(identityPath)

      const result = await checker.check(['Great question!'])

      // No forbidden_patterns to check, so no findings
      expect(result.findings).toEqual([])
    })

    it('should cap score at 1.0', async () => {
      const checker = new IntegrityChecker(identityPath)

      // Many violations to push score beyond 1.0
      const result = await checker.check([
        'Great question! Sure thing! Great question! Sure thing!',
        "I'd be happy to help! Great question! I'd be happy to help!",
        'Sure thing! Great question! Sure thing!',
        "I'd be happy to help! Sure thing!",
        'Great question!',
        'Sure thing!'
      ])

      expect(result.score).toBeLessThanOrEqual(1)
    })
  })
})
