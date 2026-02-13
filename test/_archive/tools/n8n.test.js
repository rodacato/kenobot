import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import N8nTriggerTool from '../../src/tools/n8n.js'

describe('N8nTriggerTool', () => {
  let tool

  beforeEach(() => {
    tool = new N8nTriggerTool({ webhookBase: 'https://n8n.example.com/webhook' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('n8n_trigger')
    })

    it('should require workflow parameter', () => {
      expect(tool.definition.input_schema.required).toContain('workflow')
    })
  })

  describe('trigger', () => {
    it('should match /n8n <workflow>', () => {
      const match = '/n8n daily-summary'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(tool.parseTrigger(match)).toEqual({ workflow: 'daily-summary' })
    })

    it('should match /n8n <workflow> <json data>', () => {
      const match = '/n8n send-email {"to":"test@example.com"}'.match(tool.trigger)
      expect(match).not.toBeNull()
      const input = tool.parseTrigger(match)
      expect(input.workflow).toBe('send-email')
      expect(input.data).toEqual({ to: 'test@example.com' })
    })

    it('should ignore bad JSON in data', () => {
      const match = '/n8n workflow not-json'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.workflow).toBe('workflow')
      expect(input.data).toBeUndefined()
    })

    it('should not match without workflow name', () => {
      expect('/n8n'.match(tool.trigger)).toBeNull()
    })
  })

  describe('execute', () => {
    it('should POST to webhook URL with workflow path', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'Workflow executed'
      })
      vi.stubGlobal('fetch', mockFetch)

      await tool.execute({ workflow: 'daily-summary' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/daily-summary',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        })
      )
    })

    it('should send data payload in body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'done'
      })
      vi.stubGlobal('fetch', mockFetch)

      await tool.execute({ workflow: 'send-email', data: { to: 'test@example.com' } })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).toEqual({ to: 'test@example.com' })
    })

    it('should return response text', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => 'Result: 3 events found'
      }))

      const result = await tool.execute({ workflow: 'check-calendar' })
      expect(result).toBe('Result: 3 events found')
    })

    it('should return default message when response is empty', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => ''
      }))

      const result = await tool.execute({ workflow: 'cleanup' })
      expect(result).toBe('Workflow "cleanup" triggered successfully')
    })

    it('should throw on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      }))

      await expect(tool.execute({ workflow: 'broken' }))
        .rejects.toThrow('n8n webhook failed: 500 Internal Server Error')
    })
  })
})
