import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Import the module to get both the class (via register) and the register function
let DevTool
let register

describe('DevTool', () => {
  let projectsDir
  let tool

  beforeEach(async () => {
    // Dynamic import to avoid issues with module caching
    const mod = await import('../../src/tools/dev.js')
    register = mod.register

    // Create a temp workspace with project directories
    projectsDir = await mkdtemp(join(tmpdir(), 'kenobot-dev-test-'))
    await mkdir(join(projectsDir, 'myapp'))
    await mkdir(join(projectsDir, 'kenobot'))
    await mkdir(join(projectsDir, '.hidden'))
    await writeFile(join(projectsDir, 'not-a-dir.txt'), 'file')

    // Register tool via the register function to get an instance
    const registry = {
      _tool: null,
      register(t) { this._tool = t }
    }
    register(registry, { config: { projectsDir } })
    tool = registry._tool
  })

  afterEach(async () => {
    await rm(projectsDir, { recursive: true })
  })

  describe('register', () => {
    it('should not register without projectsDir', () => {
      const registry = { _tool: null, register(t) { this._tool = t } }
      register(registry, { config: { projectsDir: '' } })
      expect(registry._tool).toBeNull()
    })

    it('should register when projectsDir is set', () => {
      expect(tool).not.toBeNull()
      expect(tool.definition.name).toBe('dev')
    })
  })

  describe('trigger', () => {
    it('should match /dev with arguments', () => {
      const match = '/dev kenobot fix bug'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(tool.parseTrigger(match)).toEqual({ text: 'kenobot fix bug' })
    })

    it('should match /dev without arguments', () => {
      const match = '/dev'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(tool.parseTrigger(match)).toEqual({ text: '' })
    })

    it('should match /dev with multiline task', () => {
      const match = '/dev kenobot fix\nthe memory bug'.match(tool.trigger)
      expect(match).not.toBeNull()
      expect(tool.parseTrigger(match).text).toContain('fix\nthe memory bug')
    })

    it('should not match /device or other words', () => {
      expect('/device list'.match(tool.trigger)).toBeNull()
    })
  })

  describe('execute', () => {
    describe('list projects', () => {
      it('should list available projects when no args given', async () => {
        const result = await tool.execute({ text: '' })
        expect(result).toContain('Available projects')
        expect(result).toContain('kenobot')
        expect(result).toContain('myapp')
        expect(result).not.toContain('.hidden')
      })

      it('should show usage hint in project list', async () => {
        const result = await tool.execute({ text: '' })
        expect(result).toContain('Usage: /dev <project> <task>')
      })

      it('should handle empty workspace', async () => {
        const emptyDir = await mkdtemp(join(tmpdir(), 'kenobot-dev-empty-'))
        const registry = { _tool: null, register(t) { this._tool = t } }
        register(registry, { config: { projectsDir: emptyDir } })
        const emptyTool = registry._tool

        const result = await emptyTool.execute({ text: '' })
        expect(result).toContain('No projects found')

        await rm(emptyDir, { recursive: true })
      })
    })

    describe('dev mode activation', () => {
      it('should return devMode JSON for valid project + task', async () => {
        const result = await tool.execute({ text: 'kenobot fix the memory bug' })
        const parsed = JSON.parse(result)

        expect(parsed.devMode).toBe(true)
        expect(parsed.cwd).toBe(join(projectsDir, 'kenobot'))
        expect(parsed.project).toBe('kenobot')
        expect(parsed.task).toBe('fix the memory bug')
      })

      it('should handle single-word tasks', async () => {
        const result = await tool.execute({ text: 'myapp test' })
        const parsed = JSON.parse(result)

        expect(parsed.devMode).toBe(true)
        expect(parsed.project).toBe('myapp')
        expect(parsed.task).toBe('test')
      })
    })

    describe('error handling', () => {
      it('should error when project not found', async () => {
        const result = await tool.execute({ text: 'nonexistent do thing' })
        expect(result).toContain("'nonexistent' not found")
        expect(result).toContain('kenobot')
      })

      it('should error when no task specified', async () => {
        const result = await tool.execute({ text: 'kenobot' })
        expect(result).toContain('No task specified')
        expect(result).toContain('/dev kenobot')
      })

      it('should error on non-directory target', async () => {
        const result = await tool.execute({ text: 'not-a-dir.txt do thing' })
        expect(result).toContain('not a directory')
      })
    })

    describe('security', () => {
      it('should reject path traversal with ..', async () => {
        const result = await tool.execute({ text: '../etc do thing' })
        expect(result).toContain('Invalid project name')
      })

      it('should reject path traversal with /', async () => {
        const result = await tool.execute({ text: 'foo/bar do thing' })
        expect(result).toContain('Invalid project name')
      })

      it('should reject path traversal with backslash', async () => {
        const result = await tool.execute({ text: 'foo\\bar do thing' })
        expect(result).toContain('Invalid project name')
      })

      it('should reject symlinks that escape projectsDir', async () => {
        await symlink('/tmp', join(projectsDir, 'escape'))
        const result = await tool.execute({ text: 'escape do thing' })
        expect(result).toContain('Invalid project name')
      })
    })
  })
})
