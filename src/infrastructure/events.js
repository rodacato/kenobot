/**
 * Bus event name constants.
 *
 * Central constants prevent silent failures from typos in event strings.
 * Import individual constants: import { MESSAGE_IN, MESSAGE_OUT } from './events.js'
 */

// Core message flow
export const MESSAGE_IN = 'message:in'
export const MESSAGE_OUT = 'message:out'
export const THINKING_START = 'thinking:start'
export const NOTIFICATION = 'notification'
export const ERROR = 'error'

// Config lifecycle
export const CONFIG_CHANGED = 'config:changed'

// Health monitoring
export const HEALTH_DEGRADED = 'health:degraded'
export const HEALTH_UNHEALTHY = 'health:unhealthy'
export const HEALTH_RECOVERED = 'health:recovered'

// Approval workflow
export const APPROVAL_PROPOSED = 'approval:proposed'
export const APPROVAL_APPROVED = 'approval:approved'
export const APPROVAL_REJECTED = 'approval:rejected'

// Task lifecycle (Motor System — Phase 1c)
export const TASK_QUEUED = 'task:queued'
export const TASK_STARTED = 'task:started'
export const TASK_PROGRESS = 'task:progress'
export const TASK_COMPLETED = 'task:completed'
export const TASK_FAILED = 'task:failed'
export const TASK_CANCELLED = 'task:cancelled'
