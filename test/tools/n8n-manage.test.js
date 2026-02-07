import { describe, it, expect, beforeEach, vi } from 'vitest'
import N8nManageTool from '../../src/tools/n8n-manage.js'

describe('N8nManageTool', () => {
  let tool

  beforeEach(() => {
    tool = new N8nManageTool({
      n8nApiUrl: 'http://localhost:5678',
      n8nApiKey: 'test-api-key'
    })
  })

  describe('definition', () => {
    it('should have correct name and schema', () => {
      const def = tool.definition
      expect(def.name).toBe('n8n_manage')
      expect(def.input_schema.properties.action).toBeDefined()
      expect(def.input_schema.properties.id).toBeDefined()
      expect(def.input_schema.properties.name).toBeDefined()
    })
  })

  describe('trigger', () => {
    it('should match /n8n-manage commands', () => {
      expect(tool.trigger.test('/n8n-manage list')).toBe(true)
      expect(tool.trigger.test('/n8n-manage get 123')).toBe(true)
      expect(tool.trigger.test('/n8n-manage activate 456')).toBe(true)
      expect(tool.trigger.test('/N8N-MANAGE LIST')).toBe(true)
    })

    it('should parse list trigger', () => {
      const match = '/n8n-manage list'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('list')
    })

    it('should parse get trigger with id', () => {
      const match = '/n8n-manage get 123'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('get')
      expect(input.id).toBe('123')
    })

    it('should parse activate trigger', () => {
      const match = '/n8n-manage activate 789'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('activate')
      expect(input.id).toBe('789')
    })
  })

  describe('list', () => {
    it('should list workflows', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: '1', name: 'daily-summary', active: true },
            { id: '2', name: 'gmail-inbox', active: false }
          ]
        })
      })

      const result = await tool.execute({ action: 'list' })
      expect(result).toContain('daily-summary')
      expect(result).toContain('gmail-inbox')
      expect(result).toContain('active')
      expect(result).toContain('inactive')

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5678/api/v1/workflows',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'X-N8N-API-KEY': 'test-api-key' })
        })
      )
    })

    it('should handle empty workflow list', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      })

      const result = await tool.execute({ action: 'list' })
      expect(result).toBe('No workflows found.')
    })
  })

  describe('get', () => {
    it('should get workflow details', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '1',
          name: 'test-wf',
          active: true,
          nodes: [{ type: 'n8n-nodes-base.webhook' }],
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02'
        })
      })

      const result = await tool.execute({ action: 'get', id: '1' })
      const parsed = JSON.parse(result)
      expect(parsed.name).toBe('test-wf')
      expect(parsed.active).toBe(true)
      expect(parsed.nodes).toBe(1)
    })

    it('should throw without id', async () => {
      await expect(tool.execute({ action: 'get' })).rejects.toThrow('id is required')
    })
  })

  describe('create', () => {
    it('should create a workflow', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '42', name: 'new-wf' })
      })

      const result = await tool.execute({
        action: 'create',
        name: 'new-wf',
        nodes: [],
        connections: {}
      })

      expect(result).toContain('Workflow created: new-wf')
      expect(result).toContain('42')
    })

    it('should throw without name', async () => {
      await expect(tool.execute({ action: 'create' })).rejects.toThrow('name is required')
    })
  })

  describe('activate/deactivate', () => {
    it('should activate a workflow', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', active: true })
      })

      const result = await tool.execute({ action: 'activate', id: '1' })
      expect(result).toContain('activated')
    })

    it('should deactivate a workflow', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '1', active: false })
      })

      const result = await tool.execute({ action: 'deactivate', id: '1' })
      expect(result).toContain('deactivated')
    })

    it('should throw without id', async () => {
      await expect(tool.execute({ action: 'activate' })).rejects.toThrow('id is required')
    })
  })

  describe('API errors', () => {
    it('should throw on API error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Something went wrong'
      })

      await expect(tool.execute({ action: 'list' })).rejects.toThrow('n8n API error: 500')
    })
  })

  describe('unknown action', () => {
    it('should throw on unknown action', async () => {
      await expect(tool.execute({ action: 'nope' })).rejects.toThrow('Unknown action')
    })
  })
})
