import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import WorkspaceTool from '../../src/tools/workspace.js'

describe('WorkspaceTool', () => {
  let tmpDir, tool

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kenobot-ws-tool-'))
    tool = new WorkspaceTool(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('definition', () => {
    it('should have correct name and schema', () => {
      const def = tool.definition
      expect(def.name).toBe('workspace')
      expect(def.input_schema.properties.action).toBeDefined()
      expect(def.input_schema.properties.path).toBeDefined()
    })
  })

  describe('trigger', () => {
    it('should match /workspace commands', () => {
      expect(tool.trigger.test('/workspace list notes/')).toBe(true)
      expect(tool.trigger.test('/workspace read file.md')).toBe(true)
      expect(tool.trigger.test('/WORKSPACE LIST')).toBe(true)
    })

    it('should parse trigger correctly', () => {
      const match = '/workspace list skills/'.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.action).toBe('list')
      expect(input.path).toBe('skills/')
    })

    it('should default path to . when empty', () => {
      const match = '/workspace list '.match(tool.trigger)
      const input = tool.parseTrigger(match)
      expect(input.path).toBe('.')
    })
  })

  describe('write', () => {
    it('should create a file', async () => {
      const result = await tool.execute({
        action: 'write',
        path: 'notes/test.md',
        content: '# Test'
      })

      expect(result).toContain('Written')
      const content = await readFile(join(tmpDir, 'notes/test.md'), 'utf8')
      expect(content).toBe('# Test')
    })

    it('should create parent directories', async () => {
      await tool.execute({
        action: 'write',
        path: 'deep/nested/dir/file.txt',
        content: 'hello'
      })

      const content = await readFile(join(tmpDir, 'deep/nested/dir/file.txt'), 'utf8')
      expect(content).toBe('hello')
    })

    it('should reject write without content', async () => {
      await expect(tool.execute({
        action: 'write',
        path: 'file.txt'
      })).rejects.toThrow('content is required')
    })

    it('should allow writing empty string', async () => {
      await tool.execute({ action: 'write', path: 'empty.txt', content: '' })
      const content = await readFile(join(tmpDir, 'empty.txt'), 'utf8')
      expect(content).toBe('')
    })
  })

  describe('read', () => {
    it('should read a file', async () => {
      await writeFile(join(tmpDir, 'test.md'), 'hello world')

      const result = await tool.execute({ action: 'read', path: 'test.md' })
      expect(result).toBe('hello world')
    })

    it('should throw on non-existent file', async () => {
      await expect(tool.execute({ action: 'read', path: 'nope.txt' })).rejects.toThrow()
    })
  })

  describe('list', () => {
    it('should list directory contents', async () => {
      await mkdir(join(tmpDir, 'skills'), { recursive: true })
      await writeFile(join(tmpDir, 'file1.md'), '')
      await writeFile(join(tmpDir, 'file2.md'), '')

      const result = await tool.execute({ action: 'list', path: '.' })
      expect(result).toContain('file1.md')
      expect(result).toContain('file2.md')
      expect(result).toContain('skills/')
    })

    it('should return (empty) for empty directory', async () => {
      await mkdir(join(tmpDir, 'empty'))
      const result = await tool.execute({ action: 'list', path: 'empty' })
      expect(result).toBe('(empty)')
    })
  })

  describe('delete', () => {
    it('should delete a file', async () => {
      await writeFile(join(tmpDir, 'to-delete.txt'), 'bye')

      const result = await tool.execute({ action: 'delete', path: 'to-delete.txt' })
      expect(result).toContain('Deleted')

      await expect(readFile(join(tmpDir, 'to-delete.txt'))).rejects.toThrow()
    })
  })

  describe('path safety', () => {
    it('should block path traversal', async () => {
      await expect(tool.execute({
        action: 'read',
        path: '../../../etc/passwd'
      })).rejects.toThrow('Path traversal blocked')
    })

    it('should block absolute paths outside workspace', async () => {
      await expect(tool.execute({
        action: 'read',
        path: '/etc/passwd'
      })).rejects.toThrow('Path traversal blocked')
    })
  })

  describe('unknown action', () => {
    it('should throw on unknown action', async () => {
      await expect(tool.execute({ action: 'nope', path: '.' })).rejects.toThrow('Unknown action')
    })
  })
})
