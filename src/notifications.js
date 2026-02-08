/**
 * Notifications - Routes system events to the bot owner via Telegram
 *
 * Listens for health and approval bus events and forwards them
 * as messages to the first allowed chat ID (owner).
 */
export function setupNotifications(bus, config) {
  const ownerChat = config.telegram.allowedUsers?.[0] || config.telegram.allowedChatIds?.[0]
  if (!ownerChat) return

  const notify = (text) => bus.emit('message:out', { chatId: ownerChat, text, channel: 'telegram' })

  bus.on('health:degraded', ({ detail }) => notify(`Health degraded: ${detail}`))
  bus.on('health:unhealthy', ({ detail }) => notify(`UNHEALTHY: ${detail}`))
  bus.on('health:recovered', ({ previous }) => notify(`Recovered (was ${previous})`))
  bus.on('approval:proposed', ({ id, type, name }) =>
    notify(`New proposal: [${type}] ${name} (ID: ${id})\nUse /approve ${id} or /reject ${id}`)
  )
}
