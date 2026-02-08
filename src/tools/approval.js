import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { APPROVAL_PROPOSED, APPROVAL_APPROVED, APPROVAL_REJECTED } from '../events.js'
import BaseTool from './base.js'
import { safePath } from '../utils/safe-path.js'
import logger from '../logger.js'

/**
 * ApprovalTool - Manage proposals that require owner approval
 *
 * The bot proposes changes (skills, workflows, identity) by writing them
 * to workspace/staging/. The owner approves or rejects via slash commands.
 *
 * Slash commands:
 *   /approve <id>   — Approve a pending proposal
 *   /reject <id>    — Reject a pending proposal
 *   /pending        — List pending proposals
 *   /review <id>    — Show proposal details
 *
 * LLM tool_use:
 *   approval { action: "propose", type: "skill", name: "...", ... }
 */
export default class ApprovalTool extends BaseTool {
  /**
   * @param {string} workspaceDir - Path to workspace directory
   * @param {Object} callbacks - Event callbacks (replaces direct bus/skillLoader coupling)
   * @param {Function} callbacks.onProposed - Called when a proposal is created
   * @param {Function} callbacks.onApproved - Called when a proposal is approved
   * @param {Function} callbacks.onRejected - Called when a proposal is rejected
   * @param {Function} callbacks.activateSkill - Called to hot-reload a skill after approval
   * @param {Function} callbacks.reloadIdentity - Called to reload identity after soul/identity approval
   */
  constructor(workspaceDir, { onProposed, onApproved, onRejected, activateSkill, reloadIdentity } = {}) {
    super()
    this.workspaceDir = workspaceDir
    this._onProposed = onProposed || (() => {})
    this._onApproved = onApproved || (() => {})
    this._onRejected = onRejected || (() => {})
    this._onSkillActivated = activateSkill || (() => {})
    this._onReloadIdentity = reloadIdentity || (() => {})
    this.queueFile = join(workspaceDir, 'staging', 'approvals.json')
  }

  get definition() {
    return {
      name: 'approval',
      description: 'Propose changes for owner approval. Propose new skills, workflows, soul, or identity changes. Owner approves via /approve, /reject, /pending, /review.',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['propose', 'pending', 'approve', 'reject', 'review'],
            description: 'Action to perform'
          },
          type: {
            type: 'string',
            enum: ['skill', 'workflow', 'identity', 'soul'],
            description: 'Type of proposal (required for propose)'
          },
          name: {
            type: 'string',
            description: 'Name of the proposed item (required for propose)'
          },
          description: {
            type: 'string',
            description: 'Description of what is being proposed'
          },
          id: {
            type: 'string',
            description: 'Proposal ID (required for approve/reject/review)'
          },
          reason: {
            type: 'string',
            description: 'Reason for rejection (optional for reject)'
          }
        },
        required: ['action']
      }
    }
  }

  get trigger() {
    return /^\/(approve|reject|pending|review)\s*(.*)/i
  }

  parseTrigger(match) {
    const action = match[1].toLowerCase()
    const arg = match[2]?.trim() || ''
    if (action === 'approve' || action === 'reject' || action === 'review') {
      return { action, id: arg }
    }
    return { action }
  }

  async execute(input) {
    switch (input.action) {
      case 'propose': return this._propose(input)
      case 'pending': return this._listPending()
      case 'approve': return this._approve(input.id)
      case 'reject': return this._reject(input.id, input.reason)
      case 'review': return this._review(input.id)
      default: throw new Error(`Unknown action: ${input.action}`)
    }
  }

  async _propose({ type, name, description }) {
    if (!type) throw new Error('type is required for propose')
    if (!name) throw new Error('name is required for propose')

    const id = randomUUID().slice(0, 8)
    const item = {
      id,
      type,
      name,
      description: description || name,
      status: 'pending',
      createdAt: new Date().toISOString()
    }

    const queue = await this._loadQueue()
    queue.push(item)
    await this._saveQueue(queue)

    logger.info('approval', 'proposed', { id, type, name })
    this._onProposed({ id, type, name, description: item.description })

    return `Proposed: ${name} (${type}) — ID: ${id}\nAwaiting owner approval via /approve ${id}`
  }

  async _listPending() {
    const queue = await this._loadQueue()
    const pending = queue.filter(i => i.status === 'pending')
    if (pending.length === 0) return 'No pending proposals.'

    return pending.map(i =>
      `- ${i.id}: [${i.type}] ${i.name} — ${i.description} (${i.createdAt})`
    ).join('\n')
  }

  async _review(id) {
    if (!id) throw new Error('id is required for review')
    const item = await this._getItem(id)

    const parts = [
      `ID: ${item.id}`,
      `Type: ${item.type}`,
      `Name: ${item.name}`,
      `Description: ${item.description}`,
      `Status: ${item.status}`,
      `Created: ${item.createdAt}`
    ]

    // Try to show staging content
    const stagingDir = join(this.workspaceDir, 'staging', `${item.type}s`, item.name)
    try {
      const resolved = safePath(this.workspaceDir, join('staging', `${item.type}s`, item.name))
      // Read manifest or main file
      const fileMap = {
        skill: ['manifest.json', 'SKILL.md'],
        workflow: ['workflow.json'],
        identity: ['IDENTITY.md'],
        soul: ['SOUL.md']
      }
      const files = fileMap[item.type] || ['IDENTITY.md']

      for (const file of files) {
        try {
          const content = await readFile(join(resolved, file), 'utf8')
          parts.push(`\n--- ${file} ---\n${content}`)
        } catch { /* file may not exist */ }
      }
    } catch { /* staging dir may not exist */ }

    return parts.join('\n')
  }

  async _approve(id) {
    if (!id) throw new Error('id is required for approve')
    const queue = await this._loadQueue()
    const item = queue.find(i => i.id === id || i.id.startsWith(id))
    if (!item) throw new Error(`Proposal not found: ${id}`)
    if (item.status !== 'pending') throw new Error(`Proposal ${id} is already ${item.status}`)

    // Activate based on type
    switch (item.type) {
      case 'skill':
        await this._activateSkill(item)
        break
      case 'workflow':
        await this._activateWorkflow(item)
        break
      case 'identity':
        await this._activateIdentity(item)
        await this._onReloadIdentity()
        break
      case 'soul':
        await this._activateSoul(item)
        await this._onReloadIdentity()
        break
    }

    item.status = 'approved'
    item.approvedAt = new Date().toISOString()
    await this._saveQueue(queue)

    logger.info('approval', 'approved', { id: item.id, type: item.type, name: item.name })
    this._onApproved({ id: item.id, type: item.type, name: item.name })

    return `Approved: ${item.name} (${item.type})`
  }

  async _reject(id, reason) {
    if (!id) throw new Error('id is required for reject')
    const queue = await this._loadQueue()
    const item = queue.find(i => i.id === id || i.id.startsWith(id))
    if (!item) throw new Error(`Proposal not found: ${id}`)
    if (item.status !== 'pending') throw new Error(`Proposal ${id} is already ${item.status}`)

    item.status = 'rejected'
    item.rejectedAt = new Date().toISOString()
    item.reason = reason || ''
    await this._saveQueue(queue)

    logger.info('approval', 'rejected', { id: item.id, type: item.type, name: item.name, reason })
    this._onRejected({ id: item.id, type: item.type, name: item.name, reason })

    return `Rejected: ${item.name} (${item.type})${reason ? ` — ${reason}` : ''}`
  }

  async _activateSkill(item) {
    const src = safePath(this.workspaceDir, join('staging', 'skills', item.name))
    const dest = join(this.workspaceDir, 'skills', item.name)
    await mkdir(dirname(dest), { recursive: true })
    await cp(src, dest, { recursive: true })

    // Hot-reload the skill via callback
    await this._onSkillActivated(item.name, join(this.workspaceDir, 'skills'))
  }

  async _activateWorkflow(item) {
    const src = safePath(this.workspaceDir, join('staging', 'workflows', item.name))
    const dest = join(this.workspaceDir, 'workflows', item.name)
    await mkdir(dirname(dest), { recursive: true })
    await cp(src, dest, { recursive: true })
  }

  async _activateIdentity(item) {
    const src = safePath(this.workspaceDir, join('staging', 'identity', item.name))
    const dest = join(this.workspaceDir, 'identity', item.name)
    await mkdir(dirname(dest), { recursive: true })
    await cp(src, dest, { recursive: true })
  }

  async _activateSoul(item) {
    const src = safePath(this.workspaceDir, join('staging', 'souls', item.name))
    const dest = join(this.workspaceDir, 'soul', item.name)
    await mkdir(dirname(dest), { recursive: true })
    await cp(src, dest, { recursive: true })
  }

  async _getItem(id) {
    const queue = await this._loadQueue()
    const item = queue.find(i => i.id === id || i.id.startsWith(id))
    if (!item) throw new Error(`Proposal not found: ${id}`)
    return item
  }

  async _loadQueue() {
    try {
      const raw = await readFile(this.queueFile, 'utf8')
      return JSON.parse(raw)
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }

  async _saveQueue(queue) {
    await mkdir(dirname(this.queueFile), { recursive: true })
    await writeFile(this.queueFile, JSON.stringify(queue, null, 2))
  }
}

export function register(registry, { config, bus, skillLoader, identityLoader }) {
  if (!config.workspaceDir || !config.selfImprovementEnabled) return
  registry.register(new ApprovalTool(config.workspaceDir, {
    onProposed: (p) => bus.emit(APPROVAL_PROPOSED, p),
    onApproved: (p) => bus.emit(APPROVAL_APPROVED, p),
    onRejected: (p) => bus.emit(APPROVAL_REJECTED, p),
    activateSkill: (name, dir) => skillLoader.loadOne(name, dir),
    reloadIdentity: () => identityLoader.reload()
  }))
}
