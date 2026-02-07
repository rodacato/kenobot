import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ApprovalTool from '../../src/tools/approval.js'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('ApprovalTool', () => {
  let tmpDir, tool, bus, skillLoader

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-approval-'))
    await mkdir(join(tmpDir, 'staging', 'skills'), { recursive: true })
    await mkdir(join(tmpDir, 'staging', 'workflows'), { recursive: true })
    await mkdir(join(tmpDir, 'staging', 'identity'), { recursive: true })
    await mkdir(join(tmpDir, 'skills'), { recursive: true })
    await mkdir(join(tmpDir, 'workflows'), { recursive: true })
    await mkdir(join(tmpDir, 'identity'), { recursive: true })

    bus = { emit: vi.fn() }
    skillLoader = { loadOne: vi.fn() }
    tool = new ApprovalTool(tmpDir, bus, { skillLoader })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('definition', () => {
    it('should have correct name and schema', () => {
      const def = tool.definition
      expect(def.name).toBe('approval')
      expect(def.input_schema.properties.action).toBeDefined()
      expect(def.input_schema.properties.type).toBeDefined()
      expect(def.input_schema.properties.id).toBeDefined()
    })
  })

  describe('trigger', () => {
    it('should match /approve commands', () => {
      expect(tool.trigger.test('/approve abc123')).toBe(true)
      expect(tool.trigger.test('/reject abc123')).toBe(true)
      expect(tool.trigger.test('/pending')).toBe(true)
      expect(tool.trigger.test('/review abc123')).toBe(true)
      expect(tool.trigger.test('/APPROVE ABC')).toBe(true)
    })

    it('should parse approve trigger', () => {
      const match = '/approve abc123'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('approve')
      expect(input.id).toBe('abc123')
    })

    it('should parse pending trigger', () => {
      const match = '/pending'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('pending')
    })
  })

  describe('propose', () => {
    it('should create a proposal', async () => {
      const result = await tool.execute({
        action: 'propose',
        type: 'skill',
        name: 'test-skill',
        description: 'A test skill'
      })

      expect(result).toContain('Proposed: test-skill')
      expect(result).toContain('skill')
      expect(bus.emit).toHaveBeenCalledWith('approval:proposed', expect.objectContaining({
        type: 'skill',
        name: 'test-skill'
      }))
    })

    it('should require type', async () => {
      await expect(tool.execute({
        action: 'propose',
        name: 'test'
      })).rejects.toThrow('type is required')
    })

    it('should require name', async () => {
      await expect(tool.execute({
        action: 'propose',
        type: 'skill'
      })).rejects.toThrow('name is required')
    })

    it('should persist proposal to queue file', async () => {
      await tool.execute({
        action: 'propose',
        type: 'skill',
        name: 'test-skill',
        description: 'A test'
      })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const queue = JSON.parse(raw)
      expect(queue).toHaveLength(1)
      expect(queue[0].name).toBe('test-skill')
      expect(queue[0].status).toBe('pending')
    })
  })

  describe('pending', () => {
    it('should list pending proposals', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'skill1' })
      await tool.execute({ action: 'propose', type: 'workflow', name: 'wf1' })

      const result = await tool.execute({ action: 'pending' })
      expect(result).toContain('skill1')
      expect(result).toContain('wf1')
    })

    it('should return empty message when no pending', async () => {
      const result = await tool.execute({ action: 'pending' })
      expect(result).toBe('No pending proposals.')
    })

    it('should not list approved items', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'skill1' })

      // Load queue to get the id
      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const queue = JSON.parse(raw)
      const id = queue[0].id

      // Create staging files for the skill
      await mkdir(join(tmpDir, 'staging', 'skills', 'skill1'), { recursive: true })
      await writeFile(join(tmpDir, 'staging', 'skills', 'skill1', 'manifest.json'), '{}')

      await tool.execute({ action: 'approve', id })

      const result = await tool.execute({ action: 'pending' })
      expect(result).toBe('No pending proposals.')
    })
  })

  describe('review', () => {
    it('should show proposal details', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'test-skill', description: 'test desc' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const id = JSON.parse(raw)[0].id

      const result = await tool.execute({ action: 'review', id })
      expect(result).toContain('test-skill')
      expect(result).toContain('test desc')
      expect(result).toContain('skill')
    })

    it('should throw on missing id', async () => {
      await expect(tool.execute({ action: 'review' })).rejects.toThrow('id is required')
    })

    it('should throw on unknown id', async () => {
      await expect(tool.execute({ action: 'review', id: 'nope' })).rejects.toThrow('Proposal not found')
    })
  })

  describe('approve', () => {
    it('should approve and activate a skill', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'my-skill' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const id = JSON.parse(raw)[0].id

      // Create staging skill files
      await mkdir(join(tmpDir, 'staging', 'skills', 'my-skill'), { recursive: true })
      await writeFile(join(tmpDir, 'staging', 'skills', 'my-skill', 'manifest.json'), '{"name":"my-skill"}')
      await writeFile(join(tmpDir, 'staging', 'skills', 'my-skill', 'SKILL.md'), '## Instructions')

      const result = await tool.execute({ action: 'approve', id })
      expect(result).toContain('Approved: my-skill')

      // Check skill was copied
      const manifest = await readFile(join(tmpDir, 'skills', 'my-skill', 'manifest.json'), 'utf8')
      expect(manifest).toContain('my-skill')

      // Check skillLoader.loadOne was called
      expect(skillLoader.loadOne).toHaveBeenCalledWith('my-skill', join(tmpDir, 'skills'))

      // Check bus event
      expect(bus.emit).toHaveBeenCalledWith('approval:approved', expect.objectContaining({
        id,
        type: 'skill',
        name: 'my-skill'
      }))
    })

    it('should approve a workflow', async () => {
      await tool.execute({ action: 'propose', type: 'workflow', name: 'my-wf' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const id = JSON.parse(raw)[0].id

      await mkdir(join(tmpDir, 'staging', 'workflows', 'my-wf'), { recursive: true })
      await writeFile(join(tmpDir, 'staging', 'workflows', 'my-wf', 'workflow.json'), '{}')

      const result = await tool.execute({ action: 'approve', id })
      expect(result).toContain('Approved: my-wf')

      const content = await readFile(join(tmpDir, 'workflows', 'my-wf', 'workflow.json'), 'utf8')
      expect(content).toBe('{}')
    })

    it('should reject double approval', async () => {
      await tool.execute({ action: 'propose', type: 'workflow', name: 'wf' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const id = JSON.parse(raw)[0].id

      await mkdir(join(tmpDir, 'staging', 'workflows', 'wf'), { recursive: true })
      await writeFile(join(tmpDir, 'staging', 'workflows', 'wf', 'workflow.json'), '{}')

      await tool.execute({ action: 'approve', id })
      await expect(tool.execute({ action: 'approve', id })).rejects.toThrow('already approved')
    })

    it('should throw on missing id', async () => {
      await expect(tool.execute({ action: 'approve' })).rejects.toThrow('id is required')
    })

    it('should throw on unknown id', async () => {
      await expect(tool.execute({ action: 'approve', id: 'nope' })).rejects.toThrow('Proposal not found')
    })
  })

  describe('reject', () => {
    it('should reject a proposal', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'bad-skill' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const id = JSON.parse(raw)[0].id

      const result = await tool.execute({ action: 'reject', id, reason: 'not needed' })
      expect(result).toContain('Rejected: bad-skill')
      expect(result).toContain('not needed')

      expect(bus.emit).toHaveBeenCalledWith('approval:rejected', expect.objectContaining({
        id,
        name: 'bad-skill',
        reason: 'not needed'
      }))
    })

    it('should reject without reason', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'meh' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const id = JSON.parse(raw)[0].id

      const result = await tool.execute({ action: 'reject', id })
      expect(result).toContain('Rejected: meh')
    })

    it('should reject double rejection', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'x' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const id = JSON.parse(raw)[0].id

      await tool.execute({ action: 'reject', id })
      await expect(tool.execute({ action: 'reject', id })).rejects.toThrow('already rejected')
    })
  })

  describe('unknown action', () => {
    it('should throw on unknown action', async () => {
      await expect(tool.execute({ action: 'nope' })).rejects.toThrow('Unknown action')
    })
  })

  describe('short id matching', () => {
    it('should match proposals by short id prefix', async () => {
      await tool.execute({ action: 'propose', type: 'skill', name: 'test' })

      const raw = await readFile(join(tmpDir, 'staging', 'approvals.json'), 'utf8')
      const fullId = JSON.parse(raw)[0].id
      const shortId = fullId.slice(0, 4)

      const result = await tool.execute({ action: 'review', id: shortId })
      expect(result).toContain('test')
    })
  })
})
