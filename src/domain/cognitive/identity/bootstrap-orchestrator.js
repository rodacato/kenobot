import defaultLogger from '../../../infrastructure/logger.js'

/**
 * BootstrapOrchestrator - Manages natural, conversational bootstrap process
 *
 * Phases:
 * 1. Observation (messages 1-5): Learn user style implicitly
 * 2. Checkpoint (message 6): Confirm observed preferences
 * 3. Boundaries (message 7): Ask about red lines
 * 4. Complete: Save preferences and mark done
 *
 * This replaces the old questionnaire approach with natural conversation.
 */
export default class BootstrapOrchestrator {
  constructor({ logger = defaultLogger } = {}) {
    this.logger = logger

    // State (stored in working memory in real usage)
    this.phase = 'observing' // observing | checkpoint | boundaries | complete
    this.messageCount = 0
    this.observedProfile = {
      tone: null, // casual | formal | direct
      verbosity: null, // concise | detailed
      language: null, // es | en | mix
      emojiUsage: null, // frequent | occasional | none
      techContext: null // brief description
    }
    this.confirmedBoundaries = null
  }

  /**
   * Initialize bootstrap state.
   * Called when bot first starts and BOOTSTRAP.md exists.
   *
   * @returns {Object} Initial state
   */
  initialize() {
    this.phase = 'observing'
    this.messageCount = 0

    this.logger.info('bootstrap-orchestrator', 'initialized', {
      phase: this.phase
    })

    return this.getState()
  }

  /**
   * Process a message during bootstrap.
   * Returns action to take (continue | checkpoint | boundaries | complete).
   *
   * @param {string} message - User message
   * @param {Object} inferredProfile - Profile inferred from conversation (optional)
   * @returns {Object} { phase, action, checkpointMessage?, boundariesMessage? }
   */
  processMessage(message, inferredProfile = null) {
    this.messageCount++

    this.logger.info('bootstrap-orchestrator', 'message_processed', {
      phase: this.phase,
      messageCount: this.messageCount,
      hasInferredProfile: !!inferredProfile
    })

    // Update observed profile if provided
    if (inferredProfile) {
      this.observedProfile = { ...this.observedProfile, ...inferredProfile }
    }

    // State machine
    switch (this.phase) {
      case 'observing':
        return this._handleObservation()

      case 'checkpoint':
        return this._handleCheckpoint(message)

      case 'boundaries':
        return this._handleBoundaries(message)

      case 'complete':
        return { phase: 'complete', action: 'complete' }

      default:
        throw new Error(`Unknown bootstrap phase: ${this.phase}`)
    }
  }

  /**
   * Handle observation phase (messages 1-5).
   * @private
   */
  _handleObservation() {
    // Trigger checkpoint at message 6
    if (this.messageCount >= 6) {
      this.phase = 'checkpoint'
      const checkpointMessage = this._generateCheckpointMessage()

      this.logger.info('bootstrap-orchestrator', 'checkpoint_triggered', {
        messageCount: this.messageCount,
        profile: this.observedProfile
      })

      return {
        phase: 'checkpoint',
        action: 'show_checkpoint',
        checkpointMessage
      }
    }

    // Continue observing
    return {
      phase: 'observing',
      action: 'continue'
    }
  }

  /**
   * Handle checkpoint confirmation.
   * @private
   */
  _handleCheckpoint(message) {
    // User confirmed (or adjusted) preferences
    // Move to boundaries phase
    this.phase = 'boundaries'
    const boundariesMessage = this._generateBoundariesMessage()

    this.logger.info('bootstrap-orchestrator', 'checkpoint_confirmed', {
      userResponse: message.substring(0, 50)
    })

    return {
      phase: 'boundaries',
      action: 'show_boundaries',
      boundariesMessage
    }
  }

  /**
   * Handle boundaries response.
   * @private
   */
  _handleBoundaries(message) {
    // Save boundaries
    this.confirmedBoundaries = message
    this.phase = 'complete'

    this.logger.info('bootstrap-orchestrator', 'boundaries_confirmed', {
      boundariesLength: message.length
    })

    return {
      phase: 'complete',
      action: 'complete',
      boundaries: message
    }
  }

  /**
   * Generate checkpoint message based on observed profile.
   * @private
   */
  _generateCheckpointMessage() {
    const profile = this.observedProfile
    const lang = profile.language || 'es'

    // Determine language for message
    if (lang === 'en') {
      return this._generateCheckpointEN(profile)
    } else {
      return this._generateCheckpointES(profile)
    }
  }

  /**
   * Generate checkpoint message in Spanish.
   * @private
   */
  _generateCheckpointES(profile) {
    const tone = profile.tone || 'casual'
    const verbosity = profile.verbosity || 'conciso'
    const emoji = profile.emojiUsage || 'ocasional'

    let message = 'Hey, ya llevamos varias conversaciones. He notado que:\n\n'
    message += `- Prefieres respuestas ${verbosity === 'concise' ? 'cortas y directas' : 'más detalladas'} ✅\n`
    message += `- Tu tono es ${tone === 'casual' ? 'casual y directo' : tone === 'formal' ? 'más formal' : 'directo al punto'} ✅\n`

    if (emoji === 'frequent') {
      message += '- Usas emojis con frecuencia ✅\n'
    } else if (emoji === 'none') {
      message += '- Prefieres mensajes sin emojis ✅\n'
    }

    if (profile.techContext) {
      message += `- Trabajas con ${profile.techContext} ✅\n`
    }

    message += '\n¿Voy bien o ajusto algo?'

    return message
  }

  /**
   * Generate checkpoint message in English.
   * @private
   */
  _generateCheckpointEN(profile) {
    const tone = profile.tone || 'casual'
    const verbosity = profile.verbosity || 'concise'
    const emoji = profile.emojiUsage || 'occasional'

    let message = 'Hey, we\'ve had a few conversations now. I\'ve noticed that:\n\n'
    message += `- You prefer ${verbosity === 'concise' ? 'short, direct' : 'more detailed'} responses ✅\n`
    message += `- Your tone is ${tone === 'casual' ? 'casual and direct' : tone === 'formal' ? 'more formal' : 'straight to the point'} ✅\n`

    if (emoji === 'frequent') {
      message += '- You use emojis frequently ✅\n'
    } else if (emoji === 'none') {
      message += '- You prefer messages without emojis ✅\n'
    }

    if (profile.techContext) {
      message += `- You work with ${profile.techContext} ✅\n`
    }

    message += '\nAm I on track or should I adjust something?'

    return message
  }

  /**
   * Generate boundaries question.
   * @private
   */
  _generateBoundariesMessage() {
    const lang = this.observedProfile.language || 'es'

    if (lang === 'en') {
      return `Perfect! One last important thing:

Is there anything I should NEVER do without asking you first?
(for example: push to remote, delete files, destructive commands...)

Common boundaries people set:
- Ask before push to remote
- Don't delete important files
- Don't run destructive commands in production
- Check before making external API calls

What are your red lines?`
    } else {
      return `Perfecto! Una última cosa importante:

¿Hay algo que NUNCA debería hacer sin preguntarte primero?
(por ejemplo: push a remote, borrar archivos, comandos destructivos...)

Límites comunes que la gente establece:
- Preguntar antes de push a remote
- No borrar archivos importantes
- No ejecutar comandos destructivos en producción
- Confirmar antes de hacer llamadas a APIs externas

¿Cuáles son tus líneas rojas?`
    }
  }

  /**
   * Get current bootstrap state.
   *
   * @returns {Object}
   */
  getState() {
    return {
      phase: this.phase,
      messageCount: this.messageCount,
      observedProfile: this.observedProfile,
      confirmedBoundaries: this.confirmedBoundaries
    }
  }

  /**
   * Load state from storage (e.g., working memory).
   *
   * @param {Object} state - Saved state
   */
  loadState(state) {
    this.phase = state.phase || 'observing'
    this.messageCount = state.messageCount || 0
    this.observedProfile = state.observedProfile || {}
    this.confirmedBoundaries = state.confirmedBoundaries || null

    this.logger.info('bootstrap-orchestrator', 'state_loaded', {
      phase: this.phase,
      messageCount: this.messageCount
    })
  }

  /**
   * Format preferences for saving to preferences.md.
   *
   * @returns {string} Markdown-formatted preferences
   */
  formatPreferences() {
    const profile = this.observedProfile
    const boundaries = this.confirmedBoundaries || 'Not specified'

    return `# User Preferences

## Communication Style (observed)
- Length: ${profile.verbosity || 'not yet determined'}
- Tone: ${profile.tone || 'not yet determined'}
- Language: ${profile.language || 'not yet determined'}
- Emojis: ${profile.emojiUsage || 'not yet determined'}

## Technical Context (observed)
${profile.techContext ? `- Primary tech: ${profile.techContext}` : '- Not yet determined'}

## Boundaries (explicitly stated)
${boundaries}

## Bootstrap Info
- Completed: ${new Date().toISOString().split('T')[0]}
- Messages until checkpoint: ${this.messageCount}
`
  }
}
