import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import defaultLogger from '../logger.js'

const SKIP_FILES = new Set(['base.js', 'registry.js', 'loader.js'])

/**
 * ToolLoader - Auto-discover and register tools
 *
 * Scans src/tools/*.js for modules that export a register(registry, deps)
 * function. Each tool decides internally whether to register based on
 * the deps (config, services, etc.) it receives.
 *
 * Lifecycle:
 *   loadAll()  — discover, import, register, init
 *   stop()     — call stop() on all registered tools
 */
export default class ToolLoader {
  constructor(registry, deps = {}) {
    this.registry = registry
    this.deps = deps
    this.logger = deps.logger || defaultLogger
    this.toolsDir = dirname(fileURLToPath(import.meta.url))
  }

  /**
   * Auto-discover and register all tools from the tools directory.
   * After registration, calls init() on tools that define it.
   */
  async loadAll() {
    const entries = await readdir(this.toolsDir)
    const toolFiles = entries
      .filter(f => f.endsWith('.js') && !SKIP_FILES.has(f))
      .sort()

    for (const file of toolFiles) {
      try {
        const moduleUrl = pathToFileURL(join(this.toolsDir, file)).href
        const mod = await import(moduleUrl)
        if (typeof mod.register === 'function') {
          mod.register(this.registry, this.deps)
        }
      } catch (error) {
        this.logger.error('tools', 'tool_load_failed', { file, error: error.message })
      }
    }

    // Run optional init() lifecycle hook
    for (const tool of this.registry.tools.values()) {
      if (typeof tool.init === 'function') {
        try {
          await tool.init()
        } catch (error) {
          this.logger.error('tools', 'tool_init_failed', {
            name: tool.definition.name,
            error: error.message
          })
        }
      }
    }

    // Log loaded tools
    for (const def of this.registry.getDefinitions()) {
      const tool = this.registry.tools.get(def.name)
      const trigger = tool.trigger ? String(tool.trigger) : 'none'
      this.logger.info('system', 'tool_loaded', { name: def.name, trigger })
    }
    this.logger.info('system', 'tools_registered', { count: this.registry.size })
  }

  /**
   * Call stop() on all registered tools that define it.
   * Called during graceful shutdown.
   */
  async stop() {
    for (const tool of this.registry.tools.values()) {
      if (typeof tool.stop === 'function') {
        try {
          await tool.stop()
        } catch (error) {
          this.logger.error('tools', 'tool_stop_failed', {
            name: tool.definition.name,
            error: error.message
          })
        }
      }
    }
  }
}
