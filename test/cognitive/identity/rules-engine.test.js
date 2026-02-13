import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

vi.mock('../../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import RulesEngine from '../../../src/cognitive/identity/rules-engine.js'

describe('RulesEngine', () => {
  let rulesEngine
  let tempDir
  let rulesPath

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rules-engine-test-'))
    rulesEngine = new RulesEngine(tempDir)
    rulesPath = path.join(tempDir, 'rules.json')
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('loadRules', () => {
    it('should load rules.json content', async () => {
      const rules = {
        behavioral: [{ category: 'test', instruction: 'Be helpful' }],
        forbidden: [{ pattern: 'um', reason: 'Filler' }]
      }
      await fs.writeFile(rulesPath, JSON.stringify(rules))

      const loaded = await rulesEngine.loadRules()

      expect(loaded).toEqual(rules)
    })

    it('should return empty rules if file not found', async () => {
      const loaded = await rulesEngine.loadRules()

      expect(loaded).toEqual({ behavioral: [], forbidden: [] })
    })

    it('should cache loaded rules', async () => {
      const rules = { behavioral: [], forbidden: [] }
      await fs.writeFile(rulesPath, JSON.stringify(rules))

      await rulesEngine.loadRules()
      await fs.writeFile(rulesPath, JSON.stringify({ behavioral: [{ instruction: 'New' }], forbidden: [] }))
      const loaded = await rulesEngine.loadRules()

      expect(loaded.behavioral).toEqual([]) // Still cached
    })
  })

  describe('formatRulesForPrompt', () => {
    it('should format behavioral rules', () => {
      const rules = {
        behavioral: [
          {
            category: 'communication',
            instruction: 'Be concise',
            examples: ['Good: Yes', 'Bad: Well, yes']
          }
        ],
        forbidden: []
      }

      const formatted = rulesEngine.formatRulesForPrompt(rules)

      expect(formatted).toContain('## Behavioral Guidelines')
      expect(formatted).toContain('### Communication')
      expect(formatted).toContain('- Be concise')
      expect(formatted).toContain('Good: Yes')
    })

    it('should format forbidden patterns', () => {
      const rules = {
        behavioral: [],
        forbidden: [
          { pattern: 'um', reason: 'Filler word' },
          { pattern: 'like', reason: 'Unnecessary' }
        ]
      }

      const formatted = rulesEngine.formatRulesForPrompt(rules)

      expect(formatted).toContain('## Forbidden Patterns')
      expect(formatted).toContain('"um" (Filler word)')
      expect(formatted).toContain('"like" (Unnecessary)')
    })

    it('should return empty string for empty rules', () => {
      const formatted = rulesEngine.formatRulesForPrompt({ behavioral: [], forbidden: [] })

      expect(formatted).toBe('')
    })

    it('should group rules by category', () => {
      const rules = {
        behavioral: [
          { category: 'communication', instruction: 'Rule 1' },
          { category: 'technical', instruction: 'Rule 2' },
          { category: 'communication', instruction: 'Rule 3' }
        ],
        forbidden: []
      }

      const formatted = rulesEngine.formatRulesForPrompt(rules)

      expect(formatted).toContain('### Communication')
      expect(formatted).toContain('### Technical')
    })
  })

  describe('validateResponse', () => {
    beforeEach(async () => {
      const rules = {
        behavioral: [],
        forbidden: [
          { pattern: 'um', reason: 'Filler' },
          { pattern: 'let me just', reason: 'Unnecessary' }
        ]
      }
      await fs.writeFile(rulesPath, JSON.stringify(rules))
    })

    it('should detect forbidden patterns', async () => {
      const violations = await rulesEngine.validateResponse('Um, let me just check that')

      expect(violations).toContain('um')
      expect(violations).toContain('let me just')
    })

    it('should be case insensitive', async () => {
      const violations = await rulesEngine.validateResponse('UM, LET ME JUST')

      expect(violations).toHaveLength(2)
    })

    it('should return empty array for valid response', async () => {
      const violations = await rulesEngine.validateResponse('This is a clean response')

      expect(violations).toEqual([])
    })
  })

  describe('reload', () => {
    it('should clear cache and reload', async () => {
      const rules = { behavioral: [], forbidden: [] }
      await fs.writeFile(rulesPath, JSON.stringify(rules))
      await rulesEngine.loadRules()

      const newRules = { behavioral: [{ instruction: 'New' }], forbidden: [] }
      await fs.writeFile(rulesPath, JSON.stringify(newRules))
      const loaded = await rulesEngine.reload()

      expect(loaded.behavioral).toHaveLength(1)
    })
  })
})
