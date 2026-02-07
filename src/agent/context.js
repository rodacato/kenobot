import logger from '../logger.js'

/**
 * ContextBuilder - Assembles system prompt and message history for providers
 *
 * Returns provider-agnostic { system, messages } format.
 * Each provider adapts this to its own API:
 *   - claude-api: native system param + messages array
 *   - claude-cli: prepends system to prompt string
 *   - mock: ignores system, pattern-matches last message
 *
 * System prompt structure:
 *   [SOUL.md] + [IDENTITY.md] + [User Profile] + [Available tools] + [Available skills] + [Memory]
 */
export default class ContextBuilder {
  constructor(config, storage, memoryManager, toolRegistry, skillLoader, identityLoader) {
    this.config = config
    this.storage = storage
    this.memory = memoryManager || null
    this.toolRegistry = toolRegistry || null
    this.skillLoader = skillLoader || null
    this.identityLoader = identityLoader || null
    this._identity = null
  }

  /**
   * Load identity files and cache them.
   * Called once at startup by AgentLoop.
   */
  async loadIdentity() {
    if (this.identityLoader) {
      await this.identityLoader.load()
      logger.info('context', 'identity_loaded', { loader: true })
    } else {
      // Legacy path: no IdentityLoader, read single file via storage
      const identityFile = this.config.identityFile || 'identities/kenobot.md'
      this._identity = await this.storage.readFile(identityFile)
      logger.info('context', 'identity_loaded', { file: identityFile, length: this._identity.length })
    }
  }

  /**
   * Build context for a provider call.
   * @param {string} sessionId - e.g. "telegram-123456789"
   * @param {Object} message - Incoming message { text, chatId, userId, ... }
   * @returns {{ system: string, messages: Array<{role: string, content: string}> }}
   */
  async build(sessionId, message) {
    // Ensure identity is loaded
    if (this.identityLoader) {
      if (!this.identityLoader.getSoul()) {
        await this.loadIdentity()
      }
    } else if (!this._identity) {
      await this.loadIdentity()
    }

    // Build system prompt: identity + tools + skills + memory
    const { system, activeSkill } = await this._buildSystemPrompt(message.text)

    // Load session history
    const historyLimit = this.config.sessionHistoryLimit ?? 20
    const history = await this.storage.loadSession(sessionId, historyLimit)

    // Map history to provider format (strip timestamps)
    const messages = history.map(({ role, content }) => ({ role, content }))

    // Append current user message
    messages.push({ role: 'user', content: message.text })

    return { system, messages, activeSkill }
  }

  /**
   * Assemble system prompt from identity + memory context.
   * @private
   */
  async _buildSystemPrompt(messageText = '') {
    const parts = []
    let activeSkill = null

    // Identity: IdentityLoader (modular) or legacy single file
    if (this.identityLoader) {
      const soul = this.identityLoader.getSoul()
      if (soul) parts.push(soul)

      const identity = this.identityLoader.getIdentity()
      if (identity) parts.push('\n---\n\n' + identity)

      const user = await this.identityLoader.getUser()
      if (user) {
        const userSection = [
          '\n---\n',
          '## User Profile\n',
          user + '\n',
          '### How to update user preferences',
          'When you learn a user preference or profile fact, include it in your response:\n',
          '<user>Preference category: detail</user>\n',
          'Rules:',
          '- Only save genuine user preferences and profile information',
          '- Be concise: one line per preference',
          '- Don\'t duplicate existing preferences',
          '- Use this for communication preferences, timezone, name, recurring patterns\n'
        ]
        parts.push(userSection.join('\n'))
      }
    } else {
      parts.push(this._identity)
    }

    // Inject available tool names so the agent knows what it can do
    if (this.toolRegistry?.size > 0) {
      const toolList = this.toolRegistry.getDefinitions()
        .map(t => `- ${t.name}: ${t.description}`)
        .join('\n')
      parts.push(`\n---\n\n## Available tools\n${toolList}\n`)
    }

    // Inject skill list + active skill prompt (on-demand)
    if (this.skillLoader?.size > 0) {
      const skills = this.skillLoader.getAll()
      const skillList = skills.map(s => `- ${s.name}: ${s.description}`).join('\n')
      parts.push(`\n---\n\n## Available skills\n${skillList}\n`)

      const matched = this.skillLoader.match(messageText)
      if (matched) {
        const prompt = await this.skillLoader.getPrompt(matched.name)
        if (prompt) {
          activeSkill = matched.name
          parts.push(`\n---\n\n## Active skill: ${matched.name}\n${prompt}\n`)
        }
      }
    }

    if (this.memory) {
      const memoryDays = this.config.memoryDays ?? 3
      const [longTerm, recentNotes] = await Promise.all([
        this.memory.getLongTermMemory(),
        this.memory.getRecentDays(memoryDays)
      ])

      const memorySection = [
        '\n---\n',
        '## Memory\n',
        'You have persistent memory across conversations. Use it wisely.\n',
        '### How to remember things',
        'When you learn something worth remembering (important facts, project context, decisions made), include it in your response:\n',
        '<memory>Short title: fact to remember</memory>\n',
        'Rules:',
        '- Only save things that matter across conversations',
        '- Be concise: one line per memory',
        '- Don\'t save things already in your long-term memory',
        '- You can include multiple <memory> tags in one response\n'
      ]

      if (longTerm) {
        memorySection.push('### Long-term memory')
        memorySection.push(longTerm + '\n')
      }

      if (recentNotes) {
        memorySection.push('### Recent notes')
        memorySection.push(recentNotes)
      }

      parts.push(memorySection.join('\n'))
    }

    return { system: parts.join('\n'), activeSkill }
  }
}
