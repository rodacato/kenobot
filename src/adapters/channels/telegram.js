import { Bot } from 'grammy'
import BaseChannel from './base.js'
import { THINKING_START, MESSAGE_OUT, NOTIFICATION } from '../../infrastructure/events.js'
import { markdownToHTML } from '../../infrastructure/format/telegram.js'
// logger inherited from BaseChannel via this.logger

// Duplicated from loop.js intentionally — adapters cannot import application layer
const CANCEL_PATTERN = /^(para|stop|cancel|cancelar)$/i

/**
 * TelegramChannel - Telegram Bot API integration via grammy
 *
 * Handles incoming messages and sends responses back to Telegram.
 * Inherits permission checking and bus wiring from BaseChannel.
 *
 * Message debouncing: consecutive messages from the same chat sent within
 * `debounceMs` are accumulated and processed as a single request. This
 * prevents the bot from replying to each fragment when the user hits Enter
 * mid-thought. Cancel commands bypass the buffer immediately.
 */
export default class TelegramChannel extends BaseChannel {
  constructor(bus, config) {
    super(bus, config)
    this.bot = new Bot(config.token)
    this._debounceMs = config.debounceMs ?? 1500
    this._debounceBuffers = new Map() // chatId → { timer, texts[], meta }
  }

  async start() {
    this.logger.info('telegram', 'starting')

    // Validate bot token by calling getMe
    try {
      const botInfo = await this.bot.api.getMe()
      this.logger.info('telegram', 'bot_authenticated', {
        username: botInfo.username,
        id: botInfo.id,
        name: botInfo.first_name
      })
    } catch (error) {
      this.logger.error('telegram', 'authentication_failed', {
        error: error.message,
        code: error.error_code,
        hint: 'Check that TELEGRAM_BOT_TOKEN is valid. Get a token from @BotFather on Telegram'
      })
      throw new Error(`Telegram authentication failed: ${error.message}. Check your TELEGRAM_BOT_TOKEN in .env`)
    }

    // Handle incoming text messages
    this.bot.on('message:text', async (ctx) => {
      const chatType = ctx.chat.type
      const isGroup = chatType === 'group' || chatType === 'supergroup'
      let text = ctx.message.text

      // In groups: respond to authorized users always, others only on mention/reply
      if (isGroup) {
        const userId = String(ctx.from.id)
        const isAuthorizedUser = this.config.allowedUsers.includes(userId)
        const botId = ctx.me.id
        const botUsername = ctx.me.username
        const isReply = ctx.message.reply_to_message?.from?.id === botId
        const isMention = botUsername && text.includes(`@${botUsername}`)

        // Skip if not authorized and not a mention/reply
        if (!isAuthorizedUser && !isReply && !isMention) return

        // Strip @botname from message text
        if (isMention && botUsername) {
          text = text.replace(new RegExp(`@${botUsername}\\b`, 'gi'), '').trim()
        }
      }

      this._bufferOrPublish({
        text,
        chatId: String(ctx.chat.id),
        userId: String(ctx.from.id),
        timestamp: Date.now(),
        metadata: {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          chatType
        }
      })
    })

    // Store handler references for cleanup in stop()
    this._onThinking = async ({ chatId, channel }) => {
      if (channel !== this.name) return
      try {
        await this.bot.api.sendChatAction(chatId, 'typing')
      } catch { /* ignore typing failures */ }
    }

    this._onMessageOut = async ({ chatId, text, channel }) => {
      if (channel !== this.name) return
      await this._safeSend(chatId, text)
    }

    this._onNotification = async ({ chatId, text }) => {
      await this._safeSend(chatId, text)
    }

    this.bus.on(THINKING_START, this._onThinking)
    this.bus.on(MESSAGE_OUT, this._onMessageOut)
    this.bus.on(NOTIFICATION, this._onNotification)

    // Explicitly delete webhook before starting polling (Grammy requires this)
    // Catch 404 errors as they just mean no webhook was configured
    try {
      await this.bot.api.deleteWebhook({ drop_pending_updates: true })
      this.logger.info('telegram', 'webhook_deleted')
    } catch (error) {
      // 404 means no webhook exists - this is fine
      if (error.error_code !== 404) {
        this.logger.warn('telegram', 'webhook_delete_warning', {
          error: error.message,
          code: error.error_code
        })
      }
    }

    // Start polling (should not attempt to delete webhook again if we already did it)
    await this.bot.start({
      onStart: (botInfo) => {
        this.logger.info('telegram', 'polling_started', {
          username: botInfo.username,
          id: botInfo.id
        })
      }
    })
    this.logger.info('telegram', 'started')
  }

  async stop() {
    // Flush any pending debounce buffers — do not lose messages on shutdown
    for (const chatId of this._debounceBuffers.keys()) {
      this._flushBuffer(chatId)
    }
    this.logger.info('telegram', 'stopping')
    this.bus.off(THINKING_START, this._onThinking)
    this.bus.off(MESSAGE_OUT, this._onMessageOut)
    this.bus.off(NOTIFICATION, this._onNotification)
    await this.bot.stop()
  }

  async send(chatId, text) {
    const html = markdownToHTML(text)
    const chunks = this._chunkMessage(html, 4000)

    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' })
      } catch {
        // HTML parse failed — fall back to plain text
        await this.bot.api.sendMessage(chatId, chunk)
      }
    }
  }

  get name() {
    return 'telegram'
  }

  /**
   * Buffer message or publish immediately.
   *
   * When debouncing is enabled (debounceMs > 0), messages from the same chat
   * arriving within the window are accumulated and fired as one. Cancel commands
   * always bypass the buffer and fire immediately.
   *
   * @param {Object} message - {text, chatId, userId, timestamp, metadata}
   * @protected
   */
  _bufferOrPublish(message) {
    // Fast path: debounce disabled
    if (!this._debounceMs) {
      this._publishMessage(message)
      return
    }

    const { chatId } = message

    // Cancel commands bypass debounce — flush any pending batch first so the
    // cancel arrives after all prior content, maintaining causal order
    if (CANCEL_PATTERN.test(message.text.trim())) {
      this._flushBuffer(chatId)
      this._publishMessage(message)
      return
    }

    const existing = this._debounceBuffers.get(chatId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.texts.push(message.text)
      // Let the user know the bot received this message while still accumulating
      try { this.bot.api.sendChatAction(chatId, 'typing') } catch { /* ignore */ }
    } else {
      this._debounceBuffers.set(chatId, { texts: [message.text], meta: message })
    }

    const entry = this._debounceBuffers.get(chatId)
    entry.timer = setTimeout(() => this._flushBuffer(chatId), this._debounceMs)
  }

  /**
   * Flush the debounce buffer for a chat, joining accumulated texts and firing
   * a single MESSAGE_IN event.
   *
   * @param {string} chatId
   * @private
   */
  _flushBuffer(chatId) {
    const entry = this._debounceBuffers.get(chatId)
    if (!entry) return
    this._debounceBuffers.delete(chatId)
    clearTimeout(entry.timer)
    const text = entry.texts.join('\n')
    this.logger.debug('telegram', 'debounce_flushed', {
      chatId,
      messageCount: entry.texts.length,
      totalLength: text.length
    })
    this._publishMessage({ ...entry.meta, text })
  }

  /**
   * Split long messages into chunks
   * @private
   */
  _chunkMessage(text, maxLength = 4000) {
    if (text.length <= maxLength) {
      return [text]
    }

    const chunks = []
    let currentChunk = ''

    // Split by lines to avoid breaking words
    const lines = text.split('\n')

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }

        // If single line is too long, split it
        if (line.length > maxLength) {
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.slice(i, i + maxLength))
          }
        } else {
          currentChunk = line + '\n'
        }
      } else {
        currentChunk += line + '\n'
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }
}
