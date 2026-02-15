import {
  NOTIFICATION, HEALTH_DEGRADED, HEALTH_UNHEALTHY, HEALTH_RECOVERED,
  APPROVAL_PROPOSED, APPROVAL_APPROVED, APPROVAL_REJECTED
} from './events.js'

/**
 * Notifications - Routes system events to the bot owner
 *
 * Emits 'notification' events on the bus. Channels listen for these
 * and deliver to the owner. Channel-agnostic — works with Telegram,
 * HTTP, or any future channel.
 */
export function setupNotifications(bus, config) {
  const ownerChat = config.telegram.allowedUsers?.[0] || config.telegram.allowedChatIds?.[0]
  if (!ownerChat) return

  const notify = (text) => bus.fire(NOTIFICATION, { chatId: ownerChat, text }, { source: 'notifications' })

  bus.on(HEALTH_DEGRADED, ({ detail }) => notify(`Health degraded: ${detail}`))
  bus.on(HEALTH_UNHEALTHY, ({ detail }) => notify(`UNHEALTHY: ${detail}`))
  bus.on(HEALTH_RECOVERED, ({ previous }) => notify(`Recovered (was ${previous})`))

  // Approval workflow: notify owner of proposals and outcomes
  bus.on(APPROVAL_PROPOSED, ({ type, proposalCount, prUrl }) => {
    const prLine = prUrl ? `\nPR: ${prUrl}` : ''
    notify(`New ${type} proposal (${proposalCount} items)${prLine}\nReview on GitHub to approve or reject.`)
  })
  bus.on(APPROVAL_APPROVED, ({ type, prUrl }) =>
    notify(`Approved: [${type}]${prUrl ? ` ${prUrl}` : ''}`)
  )
  bus.on(APPROVAL_REJECTED, ({ type, prUrl }) =>
    notify(`Rejected: [${type}]${prUrl ? ` ${prUrl}` : ''}`)
  )
}
