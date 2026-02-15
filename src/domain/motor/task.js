import { randomBytes } from 'node:crypto'

const STATUSES = ['queued', 'started', 'completed', 'failed', 'cancelled']

/**
 * Task entity — state machine for a background Motor System task.
 *
 * Lifecycle: queued → started → completed | failed | cancelled
 */
export default class Task {
  constructor({ chatId, channel, sessionId, input }) {
    this.id = randomBytes(8).toString('hex')
    this.chatId = chatId
    this.channel = channel
    this.sessionId = sessionId
    this.input = input
    this.status = 'queued'
    this.steps = []
    this.result = null
    this.error = null
    this.createdAt = Date.now()
    this.updatedAt = Date.now()
  }

  start() {
    this._transition('started', ['queued'])
  }

  addStep(step) {
    this.steps.push({ ...step, ts: Date.now() })
    this.updatedAt = Date.now()
  }

  complete(result) {
    this._transition('completed', ['started'])
    this.result = result
  }

  fail(error) {
    this._transition('failed', ['queued', 'started'])
    this.error = typeof error === 'string' ? error : error?.message || String(error)
  }

  cancel() {
    this._transition('cancelled', ['queued', 'started'])
  }

  get isCancelled() {
    return this.status === 'cancelled'
  }

  get isActive() {
    return this.status === 'queued' || this.status === 'started'
  }

  toJSON() {
    return {
      id: this.id,
      chatId: this.chatId,
      channel: this.channel,
      sessionId: this.sessionId,
      input: this.input,
      status: this.status,
      steps: this.steps.length,
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  _transition(to, validFrom) {
    if (!validFrom.includes(this.status)) {
      throw new Error(`Cannot transition from "${this.status}" to "${to}"`)
    }
    this.status = to
    this.updatedAt = Date.now()
  }
}
