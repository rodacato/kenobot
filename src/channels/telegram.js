import { Bot } from 'grammy'
import BaseChannel from './base.js'
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
      this._publishMessage({
        text: ctx.message.text,
        chatId: String(ctx.chat.id),
        userId: String(ctx.from.id),
        timestamp: Date.now(),
        metadata: {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          chatType: ctx.chat.type
        }
      })
    })

    // Listen for typing indicator from the bus
    this.bus.on('thinking:start', async ({ chatId, channel }) => {
      if (channel !== this.name) return
      try {
        await this.bot.api.sendChatAction(chatId, 'typing')
      } catch { /* ignore typing failures */ }
    })

    // Listen for outgoing messages from the bus
    this.bus.on('message:out', async ({ chatId, text, channel }) => {
      // Only handle messages for this channel
      if (channel !== this.name) return

      try {
        await this.send(chatId, text)
      } catch (error) {
        logger.error('telegram', 'send_failed', { error: error.message, chatId })
        this.bus.emit('error', {
          source: this.name,
          error: error.message,
          context: { chatId }
        })
      }
    })

    // Start polling
    await this.bot.start()
    logger.info('telegram', 'started')
  }

  async stop() {
    logger.info('telegram', 'stopping')
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
