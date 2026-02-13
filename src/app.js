import { homedir } from 'node:os'
import { join } from 'node:path'
import { MessageBus } from './bus.js'
import { Logger } from './logger.js'
import TelegramChannel from './channels/telegram.js'
import HTTPChannel from './channels/http.js'
import FilesystemStorage from './storage/filesystem.js'
import MemoryStore from './storage/memory-store.js'
import FileMemory from './agent/memory.js'
import CompactingMemory from './agent/compacting-memory.js'
import HeuristicCompactor from './agent/heuristic-compactor.js'
import CognitiveSystem from './cognitive/index.js'
import IdentityLoader from './agent/identity.js'
import ContextBuilder from './agent/context.js'
import AgentLoop from './agent/loop.js'
import ToolRegistry from './tools/registry.js'
import ToolLoader from './tools/loader.js'
import SkillLoader from './skills/loader.js'
import Scheduler from './scheduler/scheduler.js'
import CircuitBreakerProvider from './providers/circuit-breaker.js'
import Watchdog from './watchdog.js'
import ConfigSync from './config-sync.js'
import { initWorkspace } from './workspace.js'
import { writePid, removePid } from './health.js'
import { setupNotifications } from './notifications.js'
import { CONFIG_CHANGED, APPROVAL_APPROVED, ERROR } from './events.js'

/**
 * Create a fully wired KenoBot application instance.
 *
 * Pure factory — no global side effects, no process.on, no process.exit.
 * Can be called multiple times for isolated instances (useful in tests).
 *
 * @param {Object} config - Config object (from createConfig or config singleton)
 * @param {Object} provider - Provider instance (already created, e.g. from registry)
 * @param {Object} [options]
 * @param {string} [options.homePath] - KenoBot home dir for ConfigSync
 * @param {Object} [options.logger] - Logger instance (default: new Logger per instance)
 * @param {boolean} [options.useCognitive] - Use new CognitiveSystem (default: true in Phase 1)
 */
export function createApp(config, provider, options = {}) {
  const bus = new MessageBus()

  // Per-instance logger (isolates log output between createApp() calls)
  const logger = options.logger || new Logger()
  logger.configure({ dataDir: config.dataDir })

  // Wrap provider with circuit breaker
  const circuitBreaker = new CircuitBreakerProvider(provider, { ...config.circuitBreaker, logger })

  // Watchdog + health checks
  const watchdog = new Watchdog(bus, { interval: config.watchdogInterval, logger })

  watchdog.registerCheck('provider', () => {
    const status = circuitBreaker.getStatus()
    if (status.state === 'OPEN') return { status: 'fail', detail: `circuit OPEN, ${status.failures} failures` }
    if (status.state === 'HALF_OPEN') return { status: 'warn', detail: 'circuit recovering' }
    return { status: 'ok', detail: `${status.failures} recent failures` }
  }, { critical: true })

  watchdog.registerCheck('memory', () => {
    const mb = Math.floor(process.memoryUsage().rss / 1024 / 1024)
    if (mb > 512) return { status: 'fail', detail: `${mb}MB RSS (>512MB)` }
    if (mb > 256) return { status: 'warn', detail: `${mb}MB RSS (>256MB)` }
    return { status: 'ok', detail: `${mb}MB RSS` }
  })

  if (config.n8n?.apiUrl) {
    watchdog.registerCheck('n8n', async () => {
      try {
        const res = await fetch(`${config.n8n.apiUrl}/healthz`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) return { status: 'ok', detail: 'n8n reachable' }
        return { status: 'fail', detail: `n8n returned ${res.status}` }
      } catch (error) {
        return { status: 'fail', detail: `n8n unreachable: ${error.message}` }
      }
    })
  }

  // Notifications
  setupNotifications(bus, config)

  // Config sync
  const homePath = options.homePath || join(homedir(), '.kenobot')
  const configSync = new ConfigSync(homePath, {
    repoUrl: config.configRepo,
    sshKeyPath: config.sshKeyPath,
    logger
  })

  bus.on(CONFIG_CHANGED, ({ reason }) => configSync.schedule(reason))
  bus.on(APPROVAL_APPROVED, () => configSync.schedule('approval activated'))

  // Core components
  const scheduler = new Scheduler(bus, config.dataDir, { logger })
  const storage = new FilesystemStorage(config, { logger })
  const identityLoader = new IdentityLoader(config.identityFile, { logger })
  const skillLoader = new SkillLoader(config.skillsDir, { logger })

  // Memory system - Phase 1: Support both cognitive and legacy
  const useCognitive = options.useCognitive !== false // Default: true
  let memory, cognitive

  if (useCognitive) {
    // New path: CognitiveSystem
    const memoryStore = new MemoryStore(config.dataDir, { logger })
    cognitive = new CognitiveSystem(config, memoryStore, circuitBreaker, { logger })
    memory = cognitive.getMemorySystem()
    logger.info('system', 'cognitive_enabled', { phase: 1 })
  } else {
    // Legacy path: FileMemory + CompactingMemory
    const fileMemory = new FileMemory(config.dataDir, { logger })
    const compactor = new HeuristicCompactor()
    memory = new CompactingMemory(fileMemory, compactor, {
      retentionDays: config.memoryRetentionDays,
      logger
    })
    cognitive = null
    logger.info('system', 'legacy_memory_enabled')
  }

  const toolRegistry = new ToolRegistry()
  const toolLoader = new ToolLoader(toolRegistry, {
    config, scheduler, watchdog, circuitBreaker, bus, skillLoader, identityLoader, logger
  })

  // ContextBuilder: Pass cognitive if available, otherwise memory
  const memoryManager = cognitive || memory
  const contextBuilder = new ContextBuilder(config, storage, memoryManager, toolRegistry, skillLoader, identityLoader, { logger })
  const agent = new AgentLoop(bus, circuitBreaker, contextBuilder, storage, memory, toolRegistry, { logger })
  agent.maxToolIterations = config.maxToolIterations

  // Channels
  const channels = []

  const telegram = new TelegramChannel(bus, {
    token: config.telegram.token,
    allowedUsers: config.telegram.allowedUsers,
    allowedChatIds: config.telegram.allowedChatIds,
    logger,
  })
  channels.push(telegram)

  if (config.http?.enabled) {
    if (!config.http.webhookSecret) {
      throw new Error('WEBHOOK_SECRET is required when HTTP_ENABLED=true')
    }
    const httpChannel = new HTTPChannel(bus, { ...config.http, logger })
    channels.push(httpChannel)
  }

  // Bus error handler
  bus.on(ERROR, ({ source, error }) => {
    logger.error('bus', 'event_error', {
      source,
      error: typeof error === 'string' ? error : error?.message || String(error)
    })
  })

  // Lifecycle methods
  async function start() {
    await writePid()

    if (config.workspaceDir) {
      await initWorkspace(config.workspaceDir, { sshKeyPath: config.sshKeyPath, logger })
      logger.info('system', 'workspace_initialized', { dir: config.workspaceDir })
    }

    await toolLoader.loadAll()

    await skillLoader.loadAll()
    logger.info('system', 'skills_loaded', { count: skillLoader.size })

    await scheduler.loadTasks()
    logger.info('system', 'scheduler_loaded', { tasks: scheduler.size })

    await configSync.init()

    // Fire-and-forget memory compaction on startup (only for CompactingMemory)
    if (memory.compact && typeof memory.compact === 'function') {
      memory.compact().catch(err =>
        logger.warn('system', 'compaction_failed', { error: err.message })
      )
    }

    await agent.start()
    await Promise.all(channels.map(ch => ch.start()))
    watchdog.start()
  }

  async function stop() {
    await removePid()
    await toolLoader.stop()
    watchdog.stop()
    scheduler.stop()
    agent.stop()
    await configSync.flush()
    configSync.stop()
    await Promise.all(channels.map(ch => ch.stop()))
  }

  return {
    bus,
    agent,
    channels,
    watchdog,
    scheduler,
    configSync,
    toolLoader,
    toolRegistry,
    circuitBreaker,
    storage,
    memory,
    cognitive, // Phase 1: Export cognitive system (null if legacy mode)
    logger,
    start,
    stop,
  }
}
