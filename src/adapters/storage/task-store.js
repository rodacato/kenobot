import { mkdir, appendFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import defaultLogger from '../../infrastructure/logger.js'

/**
 * TaskStore — JSONL event log per task for persistence and debugging.
 *
 * Storage: {dataDir}/motor/tasks/{taskId}.jsonl
 * Each line is a JSON object: { event, ...data, ts }
 */
export default class TaskStore {
  constructor(dataDir, { logger = defaultLogger } = {}) {
    this.tasksDir = join(dataDir, 'motor', 'tasks')
    this.logger = logger
  }

  /**
   * Append an event to a task's event log.
   * @param {string} taskId
   * @param {Object} event - Event data (must include "event" field)
   */
  async appendEvent(taskId, event) {
    const filePath = join(this.tasksDir, `${taskId}.jsonl`)
    await mkdir(dirname(filePath), { recursive: true })
    const line = JSON.stringify({ ...event, ts: Date.now() }) + '\n'
    await appendFile(filePath, line, 'utf8')
  }

  /**
   * Load all events for a task.
   * @param {string} taskId
   * @returns {Promise<Array<Object>>}
   */
  async loadEvents(taskId) {
    const filePath = join(this.tasksDir, `${taskId}.jsonl`)
    try {
      const content = await readFile(filePath, 'utf8')
      return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }
}
