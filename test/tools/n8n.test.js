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
