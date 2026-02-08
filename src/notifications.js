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

  const notify = (text) => bus.emit('notification', { chatId: ownerChat, text })

  bus.on('health:degraded', ({ detail }) => notify(`Health degraded: ${detail}`))
  bus.on('health:unhealthy', ({ detail }) => notify(`UNHEALTHY: ${detail}`))
  bus.on('health:recovered', ({ previous }) => notify(`Recovered (was ${previous})`))
  bus.on('approval:proposed', ({ id, type, name }) =>
    notify(`New proposal: [${type}] ${name} (ID: ${id})\nUse /approve ${id} or /reject ${id}`)
  )
}
