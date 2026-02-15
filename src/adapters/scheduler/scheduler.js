import cron from 'node-cron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MESSAGE_IN } from '../../infrastructure/events.js'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * Scheduler - Cron-based task scheduler with persistence
 *
 * Tasks fire via the message bus as synthetic `message:in` events,
 * reusing the entire agent loop (context → provider → response → channel).
 *
 * Persistence: tasks stored in data/scheduler/tasks.json.
 * Loaded on startup, survive restarts.
 */
const DEFAULT_MAX_TASKS = 50

export default class Scheduler {
  constructor(bus, dataDir, { maxTasks = DEFAULT_MAX_TASKS, timezone = '', logger = defaultLogger } = {}) {
    this.bus = bus
    this.tasksFile = join(dataDir, 'scheduler', 'tasks.json')
    this.tasks = new Map()
    this.maxTasks = maxTasks
    this.timezone = timezone
    this.logger = logger
  }

  /**
   * Load persisted tasks and start their cron jobs.
   */
  async loadTasks() {
    let data
    try {
      data = await readFile(this.tasksFile, 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return
      throw err
    }

    const tasks = JSON.parse(data)
    for (const task of tasks) {
      this._startJob(task)
    }
    this.logger.info('scheduler', 'tasks_loaded', { count: this.tasks.size })
  }

  /**
   * Add a new scheduled task.
   * @param {object} opts - Task definition
   * @param {string} opts.cronExpr - Cron expression (5-field)
   * @param {string} opts.message - Message text to emit when task fires
   * @param {string} opts.description - Human-readable description
   * @param {string} opts.chatId - Target chat ID
   * @param {string} opts.userId - User who created the task
   * @param {string} opts.channel - Channel name (default: 'telegram')
   * @returns {Promise<string>} Task ID
   */
  async add({ cronExpr, message, description, chatId, userId, channel }) {
    if (!cron.validate(cronExpr)) {
      throw new Error(`Invalid cron expression: ${cronExpr}`)
    }

    if (this.tasks.size >= this.maxTasks) {
      throw new Error(`Task limit reached (max ${this.maxTasks})`)
    }

    const task = {
      id: randomUUID(),
      cronExpr,
      message,
      description: description || message,
      chatId,
      userId,
      channel: channel || 'telegram',
      createdAt: Date.now()
    }

    this._startJob(task)
    await this._persist()
    this.logger.info('scheduler', 'task_added', { id: task.id, cron: cronExpr, description: task.description })
    return task.id
  }

  /**
   * Remove a scheduled task by ID.
   */
  async remove(id) {
    const entry = this.tasks.get(id)
    if (!entry) throw new Error(`Task not found: ${id}`)

    entry.job.stop()
    this.tasks.delete(id)
    await this._persist()
    this.logger.info('scheduler', 'task_removed', { id })
  }

  /**
   * List all tasks (without cron job references).
   */
  list() {
    return Array.from(this.tasks.values()).map(({ job, ...task }) => task)
  }

  /**
   * Stop all cron jobs (for graceful shutdown).
   */
  stop() {
    for (const { job } of this.tasks.values()) {
      job.stop()
    }
    this.logger.info('scheduler', 'stopped', { tasks: this.tasks.size })
  }

  /** @private Start a cron job for a task */
  _startJob(task) {
    const opts = this.timezone ? { timezone: this.timezone } : {}
    const job = cron.schedule(task.cronExpr, () => {
      this.logger.info('scheduler', 'task_fired', { id: task.id, description: task.description })
      this.bus.fire(MESSAGE_IN, {
        text: task.message,
        chatId: task.chatId,
        userId: task.userId,
        channel: task.channel,
        scheduled: true
      }, { source: 'scheduler' })
    }, opts)
    this.tasks.set(task.id, { ...task, job })
  }

  /** @private Persist all tasks to JSON file */
  async _persist() {
    const tasks = Array.from(this.tasks.values()).map(({ job, ...task }) => task)
    await mkdir(dirname(this.tasksFile), { recursive: true })
    await writeFile(this.tasksFile, JSON.stringify(tasks, null, 2))
  }

  get size() {
    return this.tasks.size
  }
}
