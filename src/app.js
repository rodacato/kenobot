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
import { writePid, removePid, getStatus } from './infrastructure/health.js'
import { setupNotifications } from './infrastructure/notifications.js'
import {
  ERROR, MESSAGE_OUT,
  TASK_QUEUED, TASK_STARTED, TASK_PROGRESS, TASK_COMPLETED, TASK_FAILED, TASK_CANCELLED,
  APPROVAL_PROPOSED, APPROVAL_APPROVED, APPROVAL_REJECTED
} from './infrastructure/events.js'
import { createToolRegistry } from './domain/motor/index.js'
import TaskStore from './adapters/storage/task-store.js'
import { ConsciousnessGateway } from './domain/consciousness/index.js'
import CLIConsciousnessAdapter from './adapters/consciousness/cli-adapter.js'
import ResponseTracker from './domain/nervous/response-tracker.js'
import CostTracker from './domain/cognitive/utils/cost-tracker.js'

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

  watchdog.registerCheck('cost', () => {
    const s = costTracker.getStats()
    if (s.daily.percent >= 100) return { status: 'fail', detail: `daily budget exceeded: $${s.daily.cost.toFixed(2)}` }
    if (s.daily.percent >= 80) return { status: 'warn', detail: `daily budget at ${s.daily.percent.toFixed(0)}%` }
    return { status: 'ok', detail: `$${s.daily.cost.toFixed(2)}/$${s.daily.budget}` }
  })

  watchdog.registerCheck('consciousness', () => {
    const s = consciousness.getStats()
    if (!s.enabled) return { status: 'ok', detail: 'disabled' }
    if (s.calls === 0) return { status: 'ok', detail: 'no calls yet' }
    const rate = parseFloat(s.fallbackRate)
    if (rate > 80) return { status: 'fail', detail: `${rate}% fallback rate` }
    if (rate > 50) return { status: 'warn', detail: `${rate}% fallback rate` }
    return { status: 'ok', detail: `${s.calls} calls, ${s.fallbackRate}% fallback` }
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

  // Consciousness Layer: fast secondary model for semantic evaluation
  const consciousnessAdapter = config.consciousness?.enabled !== false
    ? new CLIConsciousnessAdapter({
      command: config.consciousness?.provider === 'gemini-cli' ? 'gemini' : config.consciousness?.provider,
      model: config.consciousness?.model,
      timeout: config.consciousness?.timeout,
      logger
    })
    : null
  const profilesDir = join(import.meta.dirname, '..', 'templates', 'experts')
  const consciousness = new ConsciousnessGateway({
    adapter: consciousnessAdapter,
    profilesDir,
    logger,
    enabled: config.consciousness?.enabled !== false
  })

  // Cognitive System: Memory System + Identity System (with Motor System integration for self-improvement)
  const memoryStore = new MemoryStore(config.dataDir, { logger })
  const cognitiveOpts = { logger, bus, toolRegistry, consciousness }
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

  // Observability: response metrics + cost tracking
  const responseTracker = new ResponseTracker()
  const costTracker = new CostTracker({ logger })

  // ContextBuilder: Uses Cognitive System for identity and memory
  const contextBuilder = new ContextBuilder(config, storage, cognitive, { logger })
  const agent = new AgentLoop(bus, circuitBreaker, contextBuilder, storage, memory, { logger, toolRegistry, taskStore, responseTracker })

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
    const httpChannel = new HTTPChannel(bus, { ...config.http, logger, stats })
    channels.push(httpChannel)
  }

  // Error handler
  bus.on(ERROR, ({ source, error }) => {
    logger.error('nervous', 'signal_error', {
      source,
      error: typeof error === 'string' ? error : error?.message || String(error)
    })
  })

  // Motor System: task lifecycle logging + message translation
  bus.on(TASK_QUEUED, ({ taskId, chatId, input }) => {
    logger.info('motor', 'task_queued', { taskId, chatId, input: input?.slice(0, 100) })
  })
  bus.on(TASK_STARTED, ({ taskId, chatId }) => {
    logger.info('motor', 'task_started', { taskId, chatId })
  })
  bus.on(TASK_PROGRESS, ({ chatId, text, channel }) => {
    bus.fire(MESSAGE_OUT, { chatId, text, channel }, { source: 'motor' })
  })
  bus.on(TASK_COMPLETED, ({ chatId, text, channel }) => {
    bus.fire(MESSAGE_OUT, { chatId, text, channel }, { source: 'motor' })
  })
  bus.on(TASK_FAILED, ({ chatId, error, channel }) => {
    bus.fire(MESSAGE_OUT, { chatId, text: `Task failed: ${error}`, channel }, { source: 'motor' })
  })
  bus.on(TASK_CANCELLED, ({ taskId, chatId }) => {
    logger.info('motor', 'task_cancelled', { taskId, chatId })
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

  // Stats aggregator: collects metrics from all subsystems
  function stats() {
    return {
      process: getStatus(),
      nervous: bus.getStats(),
      responses: responseTracker.getStats(),
      consciousness: consciousness.getStats(),
      cost: costTracker.getStats(),
      watchdog: watchdog.getStatus(),
      circuitBreaker: circuitBreaker.getStatus(),
    }
  }

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
    consciousness,
    sleepCycle,
    responseTracker,
    costTracker,
    logger,
    stats,
    start,
    stop,
  }
}
