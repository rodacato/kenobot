import { describe, it, expect, beforeEach, vi } from 'vitest'
import ScheduleTool from '../../src/tools/schedule.js'

describe('ScheduleTool', () => {
  let tool
  let mockScheduler

  beforeEach(() => {
    mockScheduler = {
      add: vi.fn().mockResolvedValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
      remove: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockReturnValue([])
    }
    tool = new ScheduleTool(mockScheduler)
    vi.clearAllMocks()
  })

  describe('definition', () => {
    it('should have name "schedule"', () => {
      expect(tool.definition.name).toBe('schedule')
    })

    it('should require action parameter', () => {
      expect(tool.definition.input_schema.required).toContain('action')
    })
  })

  describe('trigger', () => {
    it('should match /schedule add', () => {
      const match = '/schedule add "0 9 * * *" hello'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(match[1]).toBe('add')
    })

    it('should match /schedule list', () => {
      const match = '/schedule list'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(match[1]).toBe('list')
    })

    it('should match /schedule remove', () => {
      const match = '/schedule remove abc123'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(match[1]).toBe('remove')
    })

    it('should be case insensitive', () => {
      const match = '/Schedule ADD "* * * * *" test'.match(tool.trigger)
      expect(match).not.toBeNull()
    })

    it('should not match /schedulex', () => {
      const match = '/schedulex list'.match(tool.trigger)
      expect(match).toBeNull()
    })
  })

  describe('parseTrigger', () => {
    it('should parse add with cron and message', () => {
      const match = '/schedule add "0 9 * * *" Check calendar'.match(tool.trigger)
      const result = tool.parseTrigger(match)

      expect(result).toEqual({
        action: 'add',
        cron: '0 9 * * *',
        message: 'Check calendar'
      })
    })

    it('should return error for add without proper format', () => {
      const match = '/schedule add bad format'.match(tool.trigger)
      const result = tool.parseTrigger(match)

      expect(result.action).toBe('add')
      expect(result.error).toContain('Usage')
    })

    it('should parse remove with ID', () => {
      const match = '/schedule remove abc12345'.match(tool.trigger)
      const result = tool.parseTrigger(match)

      expect(result).toEqual({ action: 'remove', id: 'abc12345' })
    })

    it('should parse list', () => {
      const match = '/schedule list'.match(tool.trigger)
      const result = tool.parseTrigger(match)

      expect(result).toEqual({ action: 'list' })
    })
  })

  describe('execute - add', () => {
    const context = { chatId: '123', userId: '456', channel: 'telegram' }

    it('should create task via scheduler', async () => {
      const result = await tool.execute(
        { action: 'add', cron: '0 9 * * *', message: 'Good morning' },
        context
      )

      expect(mockScheduler.add).toHaveBeenCalledWith({
        cronExpr: '0 9 * * *',
        message: 'Good morning',
        description: 'Good morning',
        chatId: '123',
        userId: '456',
        channel: 'telegram'
      })
      expect(result).toContain('Task scheduled')
      expect(result).toContain('aaaaaaaa')
    })

    it('should use description when provided', async () => {
      await tool.execute(
        { action: 'add', cron: '0 9 * * *', message: 'Check calendar', description: 'Daily calendar check' },
        context
      )

      expect(mockScheduler.add).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Daily calendar check' })
      )
    })

    it('should return error when cron is missing', async () => {
      const result = await tool.execute({ action: 'add', message: 'test' }, context)
      expect(result).toContain('required')
    })

    it('should return error when message is missing', async () => {
      const result = await tool.execute({ action: 'add', cron: '0 9 * * *' }, context)
      expect(result).toContain('required')
    })

    it('should return parse error from trigger', async () => {
      const result = await tool.execute(
        { action: 'add', error: 'Usage: /schedule add "cron" message' },
        context
      )
      expect(result).toContain('Usage')
    })
  })

  describe('execute - list', () => {
    it('should return "No scheduled tasks" when empty', async () => {
      const result = await tool.execute({ action: 'list' })
      expect(result).toBe('No scheduled tasks.')
    })

    it('should list tasks with short IDs', async () => {
      mockScheduler.list.mockReturnValue([
        { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', description: 'Morning check', cronExpr: '0 9 * * *' },
        { id: '11111111-2222-3333-4444-555555555555', description: 'Evening report', cronExpr: '0 17 * * *' }
      ])

      const result = await tool.execute({ action: 'list' })

      expect(result).toContain('aaaaaaaa')
      expect(result).toContain('Morning check')
      expect(result).toContain('0 9 * * *')
      expect(result).toContain('11111111')
      expect(result).toContain('Evening report')
    })
  })

  describe('execute - remove', () => {
    it('should remove task by short ID', async () => {
      mockScheduler.list.mockReturnValue([
        { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', description: 'test' }
      ])

      const result = await tool.execute({ action: 'remove', id: 'aaaaaaaa' })

      expect(mockScheduler.remove).toHaveBeenCalledWith('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
      expect(result).toContain('removed')
    })

    it('should return error when ID is missing', async () => {
      const result = await tool.execute({ action: 'remove' })
      expect(result).toContain('Task ID is required')
    })

    it('should return error when task not found', async () => {
      mockScheduler.list.mockReturnValue([])

      const result = await tool.execute({ action: 'remove', id: 'nonexistent' })
      expect(result).toContain('not found')
    })
  })

  describe('execute - unknown action', () => {
    it('should return error for unknown action', async () => {
      const result = await tool.execute({ action: 'unknown' })
      expect(result).toContain('Unknown action')
    })
  })
})
