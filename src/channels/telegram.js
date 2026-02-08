import { Bot } from 'grammy'
import BaseChannel from './base.js'
import { THINKING_START, MESSAGE_OUT, NOTIFICATION } from '../events.js'
import { markdownToHTML } from '../format/telegram.js'
import logger from '../logger.js'

/**
 * TelegramChannel - Telegram Bot API integration via grammy
 *
 * Handles incoming messages and sends responses back to Telegram.
 * Inherits permission checking and bus wiring from BaseChannel.
 */
export default class TelegramChannel extends BaseChannel {
  constructor(bus, config) {
    super(bus, config)
    this.bot = new Bot(config.token)
  }

  async start() {
    logger.info('telegram', 'starting')

    // Handle incoming text messages
    this.bot.on('message:text', async (ctx) => {
      const chatType = ctx.chat.type
      const isGroup = chatType === 'group' || chatType === 'supergroup'
      let text = ctx.message.text

      // In groups: only respond to mentions or replies to the bot
      if (isGroup) {
        const botId = ctx.me.id
        const botUsername = ctx.me.username
        const isReply = ctx.message.reply_to_message?.from?.id === botId
        const isMention = botUsername && text.includes(`@${botUsername}`)

        if (!isReply && !isMention) return // silently skip

        // Strip @botname from message text
        if (isMention && botUsername) {
          text = text.replace(new RegExp(`@${botUsername}\\b`, 'gi'), '').trim()
        }
      }

      this._publishMessage({
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

    // Start polling
    await this.bot.start()
    logger.info('telegram', 'started')
  }

  async stop() {
    logger.info('telegram', 'stopping')
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
