import defaultLogger from '../../logger.js'

/**
 * ProfileInferrer - Infers user communication preferences from messages
 *
 * Uses LLM to analyze conversation patterns and detect:
 * - Tone (casual/formal/direct)
 * - Verbosity (concise/detailed)
 * - Language preference (es/en/mix)
 * - Emoji usage (frequent/occasional/none)
 * - Technical context
 *
 * This allows natural onboarding without explicit questions.
 */
export default class ProfileInferrer {
  constructor(provider, { logger = defaultLogger } = {}) {
    this.provider = provider
    this.logger = logger
  }

  /**
   * Infer user profile from recent messages.
   *
   * @param {Array<Object>} messages - Recent conversation [{ role, content }]
   * @returns {Promise<Object>} Inferred profile
   */
  async inferProfile(messages) {
    if (!messages || messages.length === 0) {
      return this._getDefaultProfile()
    }

    // Filter to user messages only
    const userMessages = messages
      .filter(m => m.role === 'user')
      .map(m => m.content)

    if (userMessages.length === 0) {
      return this._getDefaultProfile()
    }

    const prompt = this._buildInferencePrompt(userMessages)

    try {
      const response = await this.provider.complete([
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3, // Low temperature for consistent analysis
        maxTokens: 500
      })

      const analysis = this._parseAnalysis(response.content)

      this.logger.info('profile-inferrer', 'inference_complete', {
        messageCount: userMessages.length,
        confidence: analysis.confidence
      })

      return analysis
    } catch (error) {
      this.logger.error('profile-inferrer', 'inference_failed', {
        error: error.message
      })

      // Return default on error
      return this._getDefaultProfile()
    }
  }

  /**
   * Build prompt for LLM inference.
   * @private
   */
  _buildInferencePrompt(userMessages) {
    const messagesText = userMessages.join('\n\n---\n\n')

    return `Analyze these messages from a user and infer their communication preferences.

User messages:
${messagesText}

Respond ONLY with JSON in this exact format:
{
  "tone": "casual" | "formal" | "direct",
  "verbosity": "concise" | "detailed",
  "language": "es" | "en" | "mix",
  "emojiUsage": "frequent" | "occasional" | "none",
  "techContext": "brief description of tech stack or 'unknown'",
  "confidence": 0.0-1.0
}

Guidelines:
- tone: "casual" if they use slang/informal language, "formal" if proper/professional, "direct" if terse
- verbosity: "concise" if messages are short (<50 chars average), "detailed" if longer
- language: "es" if Spanish, "en" if English, "mix" if both
- emojiUsage: "frequent" if 2+ emojis per message, "occasional" if some, "none" if zero
- techContext: mention specific tech/tools (e.g., "Node.js backend") or "unknown"
- confidence: higher if patterns are clear, lower if ambiguous

IMPORTANT: Respond with ONLY the JSON, no explanation.`
  }

  /**
   * Parse LLM analysis response.
   * @private
   */
  _parseAnalysis(content) {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const parsed = JSON.parse(jsonMatch[0])

      // Validate required fields
      const required = ['tone', 'verbosity', 'language', 'emojiUsage', 'techContext', 'confidence']
      for (const field of required) {
        if (!(field in parsed)) {
          throw new Error(`Missing required field: ${field}`)
        }
      }

      return parsed
    } catch (error) {
      this.logger.warn('profile-inferrer', 'parse_failed', {
        error: error.message,
        content: content.substring(0, 200)
      })

      return this._getDefaultProfile()
    }
  }

  /**
   * Get default profile when inference fails.
   * @private
   */
  _getDefaultProfile() {
    return {
      tone: 'casual',
      verbosity: 'concise',
      language: 'es',
      emojiUsage: 'occasional',
      techContext: 'unknown',
      confidence: 0.0
    }
  }

  /**
   * Check if inference confidence is high enough for checkpoint.
   *
   * @param {Object} profile - Inferred profile
   * @returns {boolean}
   */
  isConfident(profile) {
    return profile.confidence >= 0.6
  }
}
