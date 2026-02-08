import {
  NOTIFICATION, HEALTH_DEGRADED, HEALTH_UNHEALTHY, HEALTH_RECOVERED, APPROVAL_PROPOSED
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

  const notify = (text) => bus.emit(NOTIFICATION, { chatId: ownerChat, text })

  bus.on(HEALTH_DEGRADED, ({ detail }) => notify(`Health degraded: ${detail}`))
  bus.on(HEALTH_UNHEALTHY, ({ detail }) => notify(`UNHEALTHY: ${detail}`))
  bus.on(HEALTH_RECOVERED, ({ previous }) => notify(`Recovered (was ${previous})`))
  bus.on(APPROVAL_PROPOSED, ({ id, type, name }) =>
    notify(`New proposal: [${type}] ${name} (ID: ${id})\nUse /approve ${id} or /reject ${id}`)
  )
}
