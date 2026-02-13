import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../src/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import ToolRegistry from '../../src/tools/registry.js'

describe('ToolLoader', () => {
  // We test register() functions directly since they encapsulate
  // the conditional logic that used to live in index.js

  describe('register() exports', () => {
    let registry

    beforeEach(() => {
      registry = new ToolRegistry()
    })

    it('web-fetch: always registers', async () => {
      const { register } = await import('../../src/tools/web-fetch.js')
      register(registry)
      expect(registry.size).toBe(1)
      expect(registry.tools.has('web_fetch')).toBe(true)
    })

    it('schedule: registers with scheduler dep', async () => {
      const { register } = await import('../../src/tools/schedule.js')
      const mockScheduler = { list: vi.fn().mockReturnValue([]) }
      register(registry, { scheduler: mockScheduler })
      expect(registry.tools.has('schedule')).toBe(true)
    })

    it('diagnostics: registers with watchdog dep', async () => {
      const { register } = await import('../../src/tools/diagnostics.js')
      const mockWatchdog = { runChecks: vi.fn() }
      register(registry, { watchdog: mockWatchdog, circuitBreaker: null })
      expect(registry.tools.has('diagnostics')).toBe(true)
    })

    it('workspace: registers when workspaceDir is set', async () => {
      const { register } = await import('../../src/tools/workspace.js')
      register(registry, { config: { workspaceDir: '/tmp/ws' } })
      expect(registry.tools.has('workspace')).toBe(true)
    })

    it('workspace: skips when workspaceDir is empty', async () => {
      const { register } = await import('../../src/tools/workspace.js')
      register(registry, { config: { workspaceDir: '' } })
      expect(registry.size).toBe(0)
    })

    it('github: registers when workspaceDir is set', async () => {
      const { register } = await import('../../src/tools/github.js')
      register(registry, { config: { workspaceDir: '/tmp/ws', sshKeyPath: '' } })
      expect(registry.tools.has('github')).toBe(true)
    })

    it('github: skips when workspaceDir is empty', async () => {
      const { register } = await import('../../src/tools/github.js')
      register(registry, { config: { workspaceDir: '' } })
      expect(registry.size).toBe(0)
    })

    // n8n tools archived in Phase 1a - tests moved to test/_archive/tools/
    // To restore, see src/_archive/tools/RESTORE.md

    it('approval: registers when workspaceDir and selfImprovementEnabled', async () => {
      const { register } = await import('../../src/tools/approval.js')
      register(registry, {
        config: { workspaceDir: '/tmp/ws', selfImprovementEnabled: true },
        bus: { emit: vi.fn() },
        skillLoader: { loadOne: vi.fn() },
        identityLoader: { reload: vi.fn() }
      })
      expect(registry.tools.has('approval')).toBe(true)
    })

    it('approval: skips when selfImprovementEnabled is false', async () => {
      const { register } = await import('../../src/tools/approval.js')
      register(registry, {
        config: { workspaceDir: '/tmp/ws', selfImprovementEnabled: false },
        bus: { emit: vi.fn() },
        skillLoader: { loadOne: vi.fn() },
        identityLoader: { reload: vi.fn() }
      })
      expect(registry.size).toBe(0)
    })

    it('approval: skips when workspaceDir is empty', async () => {
      const { register } = await import('../../src/tools/approval.js')
      register(registry, {
        config: { workspaceDir: '', selfImprovementEnabled: true },
        bus: { emit: vi.fn() },
        skillLoader: { loadOne: vi.fn() },
        identityLoader: { reload: vi.fn() }
      })
      expect(registry.size).toBe(0)
    })
  })

  describe('ToolLoader class', () => {
    let tmpDir

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), 'toolloader-'))
    })

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true })
    })

    async function createToolLoader(toolsDir, registry, deps) {
      // Dynamically import to get a fresh ToolLoader each time
      const { default: ToolLoader } = await import('../../src/tools/loader.js')
      const loader = new ToolLoader(registry, deps)
      // Override toolsDir to point at our temp directory
      loader.toolsDir = toolsDir
      return loader
    }

    it('should discover and register tools from directory', async () => {
      const registry = new ToolRegistry()

      // Create a mock tool file
      await writeFile(join(tmpDir, 'mock-tool.js'), `
        import BaseTool from '${join(process.cwd(), 'src/tools/base.js')}'
        class MockTool extends BaseTool {
          get definition() { return { name: 'mock_test', description: 'Test', input_schema: { type: 'object', properties: {} } } }
          async execute() { return 'ok' }
        }
        export function register(registry) { registry.register(new MockTool()) }
      `)

      const loader = await createToolLoader(tmpDir, registry, {})
      await loader.loadAll()

      expect(registry.size).toBe(1)
      expect(registry.tools.has('mock_test')).toBe(true)
    })

    it('should skip files without register export', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(tmpDir, 'no-register.js'), `
        export default class Foo {}
      `)

      const loader = await createToolLoader(tmpDir, registry, {})
      await loader.loadAll()

      expect(registry.size).toBe(0)
    })

    it('should skip base.js, registry.js, and loader.js', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(tmpDir, 'base.js'), `export function register(r) { throw new Error('should not be called') }`)
      await writeFile(join(tmpDir, 'registry.js'), `export function register(r) { throw new Error('should not be called') }`)
      await writeFile(join(tmpDir, 'loader.js'), `export function register(r) { throw new Error('should not be called') }`)

      const loader = await createToolLoader(tmpDir, registry, {})
      await loader.loadAll()

      expect(registry.size).toBe(0)
    })

    it('should call init() on registered tools', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(tmpDir, 'init-tool.js'), `
        import BaseTool from '${join(process.cwd(), 'src/tools/base.js')}'
        class InitTool extends BaseTool {
          get definition() { return { name: 'init_test', description: 'Test', input_schema: { type: 'object', properties: {} } } }
          async execute() { return 'ok' }
          async init() { globalThis.__initCalled = true }
        }
        export function register(registry) { registry.register(new InitTool()) }
      `)

      globalThis.__initCalled = false
      const loader = await createToolLoader(tmpDir, registry, {})
      await loader.loadAll()

      expect(globalThis.__initCalled).toBe(true)
      delete globalThis.__initCalled
    })

    it('should call stop() on registered tools', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(tmpDir, 'stop-tool.js'), `
        import BaseTool from '${join(process.cwd(), 'src/tools/base.js')}'
        class StopTool extends BaseTool {
          get definition() { return { name: 'stop_test', description: 'Test', input_schema: { type: 'object', properties: {} } } }
          async execute() { return 'ok' }
          async stop() { globalThis.__stopCalled = true }
        }
        export function register(registry) { registry.register(new StopTool()) }
      `)

      globalThis.__stopCalled = false
      const loader = await createToolLoader(tmpDir, registry, {})
      await loader.loadAll()
      await loader.stop()

      expect(globalThis.__stopCalled).toBe(true)
      delete globalThis.__stopCalled
    })

    it('should not crash when a tool file has errors', async () => {
      const { default: loggerMock } = await import('../../src/logger.js')
      const registry = new ToolRegistry()

      await writeFile(join(tmpDir, 'broken-tool.js'), `
        throw new Error('broken module')
      `)

      const loader = await createToolLoader(tmpDir, registry, {})
      await loader.loadAll()

      expect(registry.size).toBe(0)
      expect(loggerMock.error).toHaveBeenCalledWith(
        'tools', 'tool_load_failed',
        expect.objectContaining({ file: 'broken-tool.js' })
      )
    })

    it('should pass deps to register functions', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(tmpDir, 'deps-tool.js'), `
        import BaseTool from '${join(process.cwd(), 'src/tools/base.js')}'
        class DepsTool extends BaseTool {
          get definition() { return { name: 'deps_test', description: 'Test', input_schema: { type: 'object', properties: {} } } }
          async execute() { return 'ok' }
        }
        export function register(registry, deps) {
          if (deps.config?.enabled) registry.register(new DepsTool())
        }
      `)

      // Without enabled flag
      const loader1 = await createToolLoader(tmpDir, registry, { config: { enabled: false } })
      await loader1.loadAll()
      expect(registry.size).toBe(0)

      // With enabled flag
      const registry2 = new ToolRegistry()
      const loader2 = await createToolLoader(tmpDir, registry2, { config: { enabled: true } })
      await loader2.loadAll()
      expect(registry2.size).toBe(1)
    })
  })

  describe('external tools directory', () => {
    let builtinDir
    let externalDir

    beforeEach(async () => {
      builtinDir = await mkdtemp(join(tmpdir(), 'toolloader-builtin-'))
      externalDir = await mkdtemp(join(tmpdir(), 'toolloader-external-'))
    })

    afterEach(async () => {
      await rm(builtinDir, { recursive: true, force: true })
      await rm(externalDir, { recursive: true, force: true })
    })

    const basePath = join(process.cwd(), 'src/tools/base.js')

    function makeTool(name) {
      return `
        import BaseTool from '${basePath}'
        class Tool extends BaseTool {
          get definition() { return { name: '${name}', description: '${name}', input_schema: { type: 'object', properties: {} } } }
          async execute() { return '${name}' }
        }
        export function register(registry) { registry.register(new Tool()) }
      `
    }

    async function createLoader(registry, deps) {
      const { default: ToolLoader } = await import('../../src/tools/loader.js')
      const loader = new ToolLoader(registry, deps)
      loader.toolsDir = builtinDir
      return loader
    }

    it('should load tools from external dir alongside built-in', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(builtinDir, 'builtin.js'), makeTool('builtin_tool'))
      await writeFile(join(externalDir, 'external.js'), makeTool('external_tool'))

      const loader = await createLoader(registry, { config: { toolsDir: externalDir } })
      await loader.loadAll()

      expect(registry.size).toBe(2)
      expect(registry.tools.has('builtin_tool')).toBe(true)
      expect(registry.tools.has('external_tool')).toBe(true)
    })

    it('should skip gracefully when external dir does not exist', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(builtinDir, 'builtin.js'), makeTool('builtin_tool'))

      const loader = await createLoader(registry, { config: { toolsDir: '/tmp/nonexistent-tools-dir' } })
      await loader.loadAll()

      expect(registry.size).toBe(1)
      expect(registry.tools.has('builtin_tool')).toBe(true)
    })

    it('should skip external loading when toolsDir is empty string', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(builtinDir, 'builtin.js'), makeTool('builtin_tool'))

      const loader = await createLoader(registry, { config: { toolsDir: '' } })
      await loader.loadAll()

      expect(registry.size).toBe(1)
    })

    it('should pass deps to external tool register functions', async () => {
      const registry = new ToolRegistry()

      await writeFile(join(externalDir, 'conditional.js'), `
        import BaseTool from '${basePath}'
        class CondTool extends BaseTool {
          get definition() { return { name: 'cond_tool', description: 'test', input_schema: { type: 'object', properties: {} } } }
          async execute() { return 'ok' }
        }
        export function register(registry, deps) {
          if (deps.config?.myFlag) registry.register(new CondTool())
        }
      `)

      // Without flag — should not register
      const loader1 = await createLoader(registry, { config: { toolsDir: externalDir, myFlag: false } })
      await loader1.loadAll()
      expect(registry.tools.has('cond_tool')).toBe(false)

      // With flag — should register
      const registry2 = new ToolRegistry()
      const loader2 = await createLoader(registry2, { config: { toolsDir: externalDir, myFlag: true } })
      await loader2.loadAll()
      expect(registry2.tools.has('cond_tool')).toBe(true)
    })

    it('should not apply SKIP_FILES filter to external dir', async () => {
      const registry = new ToolRegistry()

      // base.js in external dir should NOT be skipped (SKIP_FILES only applies to built-in)
      await writeFile(join(externalDir, 'base.js'), makeTool('external_base'))

      const loader = await createLoader(registry, { config: { toolsDir: externalDir } })
      await loader.loadAll()

      expect(registry.tools.has('external_base')).toBe(true)
    })
  })
})
