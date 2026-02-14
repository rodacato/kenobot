/**
 * Signal type constants.
 *
 * Re-exports from events.js for backward compatibility.
 * New code should import from here; existing code can keep importing events.js.
 */
export {
  MESSAGE_IN,
  MESSAGE_OUT,
  THINKING_START,
  NOTIFICATION,
  ERROR,
  CONFIG_CHANGED,
  HEALTH_DEGRADED,
  HEALTH_UNHEALTHY,
  HEALTH_RECOVERED,
  APPROVAL_PROPOSED,
  APPROVAL_APPROVED,
  APPROVAL_REJECTED
} from '../events.js'
