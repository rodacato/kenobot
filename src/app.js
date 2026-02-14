import { homedir } from 'node:os'
import { join } from 'node:path'
import { Logger } from './logger.js'
import NervousSystem from './nervous/index.js'
import { createTraceMiddleware, createLoggingMiddleware, createDeadSignalMiddleware } from './nervous/middleware.js'
import TelegramChannel from './channels/telegram.js'
import HTTPChannel from './channels/http.js'
import FilesystemStorage from './storage/filesystem.js'
import MemoryStore from './storage/memory-store.js'
import CognitiveSystem from './cognitive/index.js'
import ContextBuilder from './agent/context.js'
import AgentLoop from './agent/loop.js'
import Scheduler from './scheduler/scheduler.js'
import CircuitBreakerProvider from './providers/circuit-breaker.js'
import Watchdog from './watchdog.js'
import { writePid, removePid } from './health.js'
import { setupNotifications } from './notifications.js'
import { ERROR } from './events.js'

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
  const scheduler = new Scheduler(bus, config.dataDir, { logger })
  const storage = new FilesystemStorage(config, { logger })

  // Cognitive System: Memory System + Identity System
  const memoryStore = new MemoryStore(config.dataDir, { logger })
  const cognitiveOpts = { logger }
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

  // ContextBuilder: Uses Cognitive System for identity and memory
  const contextBuilder = new ContextBuilder(config, storage, cognitive, { logger })
  const agent = new AgentLoop(bus, circuitBreaker, contextBuilder, storage, memory, { logger })

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
