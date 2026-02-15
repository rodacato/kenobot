import { homedir } from 'node:os'
import { join } from 'node:path'
import { Logger } from './infrastructure/logger.js'
import NervousSystem from './domain/nervous/index.js'
import { createTraceMiddleware, createLoggingMiddleware, createDeadSignalMiddleware } from './domain/nervous/middleware.js'
import TelegramChannel from './adapters/channels/telegram.js'
import HTTPChannel from './adapters/channels/http.js'
import FilesystemStorage from './adapters/storage/filesystem.js'
import MemoryStore from './adapters/storage/memory-store.js'
import CognitiveSystem from './domain/cognitive/index.js'
import ContextBuilder from './application/context.js'
import AgentLoop from './application/loop.js'
import Scheduler from './adapters/scheduler/scheduler.js'
import CircuitBreakerProvider from './adapters/providers/circuit-breaker.js'
import Watchdog from './infrastructure/watchdog.js'
import { writePid, removePid } from './infrastructure/health.js'
import { setupNotifications } from './infrastructure/notifications.js'
import { ERROR, TASK_PROGRESS, TASK_COMPLETED, TASK_FAILED, APPROVAL_PROPOSED, APPROVAL_APPROVED, APPROVAL_REJECTED } from './infrastructure/events.js'
import { createToolRegistry } from './domain/motor/index.js'
import TaskStore from './adapters/storage/task-store.js'

/**
 * Create a fully wired KenoBot application instance.
 *
 * Pure factory — no global side effects, no process.on, no process.exit.
 * Can be called multiple times for isolated instances (useful in tests).
 *
 * @param {Object} config - Config object (from createConfig or config singleton)
 * @param {Object} provider - Provider instance (already created, e.g. from registry)
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance (default: new Logger per instance)
 */
export function createApp(config, provider, options = {}) {
  // Per-instance logger (isolates log output between createApp() calls)
  const logger = options.logger || new Logger()
  logger.configure({ dataDir: config.dataDir })

  // Nervous System: signal-aware event bus with middleware and audit
  const bus = new NervousSystem({ logger, dataDir: config.dataDir })
  bus.use(createTraceMiddleware())
  bus.use(createLoggingMiddleware(logger))
  bus.use(createDeadSignalMiddleware(bus, logger))

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

  // Sleep cycle health check
  watchdog.registerCheck('sleep-cycle', () => {
    const state = sleepCycle.getState()
    if (state.status === 'failed') return { status: 'warn', detail: `sleep failed: ${state.error}` }
    if (sleepCycle.shouldRun()) {
      const detail = state.lastRun ? 'overdue' : 'never run'
      return { status: 'warn', detail: `sleep cycle ${detail}` }
    }
    return { status: 'ok', detail: `last run: ${state.lastRun || 'never'}` }
  })

  // Notifications
  setupNotifications(bus, config)

  // Core components
  const scheduler = config.enableScheduler === false
    ? { loadTasks: async () => {}, stop() {}, list: () => [], get size() { return 0 } }
    : new Scheduler(bus, config.dataDir, { timezone: config.timezone, logger })
  const storage = new FilesystemStorage(config, { logger })

  // Motor System: Tool registry for ReAct loop (created before Cognitive to wire into sleep cycle)
  const toolRegistry = createToolRegistry(config)

  // Cognitive System: Memory System + Identity System (with Motor System integration for self-improvement)
  const memoryStore = new MemoryStore(config.dataDir, { logger })
  const cognitiveOpts = { logger, bus, toolRegistry }
  if (options.homePath) {
    cognitiveOpts.identityPath = join(options.homePath, 'memory', 'identity')
  }
  const cognitive = new CognitiveSystem(config, memoryStore, circuitBreaker, cognitiveOpts)
  const memory = cognitive.getMemorySystem()
  const sleepCycle = cognitive.getSleepCycle()
  logger.info('system', 'cognitive_system_ready')
  logger.info('system', 'nervous_system_ready', {
    middleware: bus._middleware.length,
    audit: !!bus.getAuditTrail()
  })
  logger.info('system', 'tool_registry_ready', { tools: toolRegistry.size })

  // Motor System: Task persistence
  const taskStore = new TaskStore(config.dataDir, { logger })

  // ContextBuilder: Uses Cognitive System for identity and memory
  const contextBuilder = new ContextBuilder(config, storage, cognitive, { logger })
  const agent = new AgentLoop(bus, circuitBreaker, contextBuilder, storage, memory, { logger, toolRegistry, taskStore })

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

  // Error handler
  bus.on(ERROR, ({ source, error }) => {
    logger.error('nervous', 'signal_error', {
      source,
      error: typeof error === 'string' ? error : error?.message || String(error)
    })
  })

  // Motor System: task signal → message translation
  bus.on(TASK_PROGRESS, ({ chatId, text, channel }) => {
    bus.fire(MESSAGE_OUT, { chatId, text, channel }, { source: 'motor' })
  })
  bus.on(TASK_COMPLETED, ({ chatId, text, channel }) => {
    bus.fire(MESSAGE_OUT, { chatId, text, channel }, { source: 'motor' })
  })
  bus.on(TASK_FAILED, ({ chatId, error, channel }) => {
    bus.fire(MESSAGE_OUT, { chatId, text: `Task failed: ${error}`, channel }, { source: 'motor' })
  })

  // Approval workflow: log outcomes to audit trail
  bus.on(APPROVAL_PROPOSED, (payload) => {
    logger.info('approval', 'proposed', { type: payload.type, proposalCount: payload.proposalCount, prUrl: payload.prUrl })
  })
  bus.on(APPROVAL_APPROVED, (payload) => {
    logger.info('approval', 'approved', { type: payload.type, prUrl: payload.prUrl })
  })
  bus.on(APPROVAL_REJECTED, (payload) => {
    logger.info('approval', 'rejected', { type: payload.type, prUrl: payload.prUrl })
  })

  // Lifecycle methods
  let sleepInterval = null

  async function start() {
    await writePid()

    await scheduler.loadTasks()
    logger.info('system', 'scheduler_loaded', { tasks: scheduler.size })

    await agent.start()
    await Promise.all(channels.map(ch => ch.start()))
    watchdog.start()

    // Sleep cycle: check every hour if it should run (default: 4am daily)
    sleepInterval = setInterval(async () => {
      if (sleepCycle.shouldRun()) {
        logger.info('system', 'sleep_cycle_triggered')
        try {
          await sleepCycle.run()
        } catch (error) {
          logger.error('system', 'sleep_cycle_error', { error: error.message })
        }
      }
    }, 60 * 60 * 1000) // Check every hour
  }

  async function stop() {
    if (sleepInterval) clearInterval(sleepInterval)
    await removePid()
    watchdog.stop()
    scheduler.stop()
    agent.stop()
    await Promise.all(channels.map(ch => ch.stop()))
  }

  return {
    bus,
    agent,
    channels,
    watchdog,
    scheduler,
    circuitBreaker,
    storage,
    memory,
    cognitive,
    sleepCycle,
    logger,
    start,
    stop,
  }
}
