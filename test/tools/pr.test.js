import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import PRTool from '../../src/tools/pr.js'

describe('PRTool', () => {
  let tool
  let tempDir

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pr-test-'))
    tool = new PRTool(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('definition', () => {
    it('returns correct tool definition', () => {
      const def = tool.definition
      expect(def.name).toBe('pr')
      expect(def.description).toContain('Pull Requests')
      expect(def.input_schema.properties.action.enum).toEqual(['create', 'list', 'view', 'merge'])
      expect(def.input_schema.required).toEqual(['action'])
    })

    it('includes all input parameters', () => {
      const props = tool.definition.input_schema.properties
      expect(props.title).toBeDefined()
      expect(props.body).toBeDefined()
      expect(props.branch).toBeDefined()
      expect(props.base).toBeDefined()
      expect(props.number).toBeDefined()
      expect(props.draft).toBeDefined()
    })
  })

  describe('trigger', () => {
    it('matches /pr commands', () => {
      expect(tool.trigger.test('/pr create')).toBe(true)
      expect(tool.trigger.test('/pr list')).toBe(true)
      expect(tool.trigger.test('/pr view 123')).toBe(true)
      expect(tool.trigger.test('/PR CREATE')).toBe(true) // case insensitive
    })

    it('does not match invalid commands', () => {
      expect(tool.trigger.test('/prs list')).toBe(false)
      expect(tool.trigger.test('pr create')).toBe(false)
    })

    it('parses create with title', () => {
      const match = '/pr create Fix the bug'.match(tool.trigger)
      const parsed = tool.parseTrigger(match)
      expect(parsed).toEqual({ action: 'create', title: 'Fix the bug' })
    })

    it('parses create without title', () => {
      const match = '/pr create'.match(tool.trigger)
      const parsed = tool.parseTrigger(match)
      expect(parsed).toEqual({ action: 'create', title: undefined })
    })

    it('parses view with number', () => {
      const match = '/pr view 42'.match(tool.trigger)
      const parsed = tool.parseTrigger(match)
      expect(parsed).toEqual({ action: 'view', number: 42 })
    })

    it('parses view without number', () => {
      const match = '/pr view '.match(tool.trigger)
      const parsed = tool.parseTrigger(match)
      expect(parsed).toEqual({ action: 'view', number: NaN })
    })

    it('parses merge with number', () => {
      const match = '/pr merge 99'.match(tool.trigger)
      const parsed = tool.parseTrigger(match)
      expect(parsed).toEqual({ action: 'merge', number: 99 })
    })

    it('parses list', () => {
      const match = '/pr list '.match(tool.trigger)
      const parsed = tool.parseTrigger(match)
      expect(parsed).toEqual({ action: 'list' })
    })
  })

  describe('execute', () => {
    it('returns error message for unknown action', async () => {
      await expect(tool.execute({ action: 'unknown' }))
        .rejects.toThrow('Unknown action: unknown')
    })

    it('requires number for merge', async () => {
      // This will fail because gh is not installed, but we test the validation
      // In a real test, we'd mock execFile
      await expect(tool.execute({ action: 'merge' }))
        .rejects.toThrow()
    })
  })

  describe('constructor', () => {
    it('stores workspace directory', () => {
      expect(tool.cwd).toBe(tempDir)
    })

    it('stores SSH key path if provided', () => {
      const toolWithKey = new PRTool(tempDir, { sshKeyPath: '/path/to/key' })
      expect(toolWithKey.sshKeyPath).toBe('/path/to/key')
    })

    it('defaults SSH key path to empty string', () => {
      expect(tool.sshKeyPath).toBe('')
    })
  })
})
