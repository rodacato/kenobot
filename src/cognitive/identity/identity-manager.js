import CoreLoader from './core-loader.js'
import RulesEngine from './rules-engine.js'
import PreferencesManager from './preferences-manager.js'
import defaultLogger from '../../logger.js'

/**
 * IdentityManager - Manages bot identity, rules, and preferences
 *
 * Coordinates three aspects of identity:
 * 1. Core: Immutable personality (core.md)
 * 2. Rules: Behavioral guidelines (rules.json)
 * 3. Preferences: User-specific learned preferences (preferences.md)
 *
 * Phase 5: Basic loading and injection
 * Phase 6: Rule validation, dynamic rule updates
 */
export default class IdentityManager {
  constructor(identityPath, { logger = defaultLogger } = {}) {
    this.identityPath = identityPath
    this.logger = logger

    // Initialize components
    this.coreLoader = new CoreLoader(identityPath, { logger })
    this.rulesEngine = new RulesEngine(identityPath, { logger })
    this.preferencesManager = new PreferencesManager(identityPath, { logger })

    this.isBootstrapped = false
  }

  /**
   * Load all identity components.
   *
   * @returns {Promise<{core: string, rules: Object, preferences: string}>}
   */
  async load() {
    const [core, rules, preferences] = await Promise.all([
      this.coreLoader.load(),
      this.rulesEngine.loadRules(),
      this.preferencesManager.load()
    ])

    // Check if bootstrap is complete
    this.isBootstrapped = await this.preferencesManager.isBootstrapped()

    this.logger.info('identity-manager', 'loaded', {
      hasCore: !!core,
      rulesCount: rules?.behavioral?.length || 0,
      hasPreferences: !!preferences,
      isBootstrapped: this.isBootstrapped
    })

    return { core, rules, preferences }
  }

  /**
   * Build identity context for LLM system prompt.
   *
   * @returns {Promise<{core: string, behavioralRules: string, preferences: string, bootstrap: string|null}>}
   */
  async buildContext() {
    const { core, rules, preferences } = await this.load()

    // Convert rules to natural language instructions
    const behavioralRules = this.rulesEngine.formatRulesForPrompt(rules)

    // Load bootstrap instructions if not complete
    let bootstrap = null
    if (!this.isBootstrapped) {
      bootstrap = await this.preferencesManager.getBootstrapInstructions()
      this.logger.info('identity-manager', 'bootstrap_loading', {
        hasBootstrap: !!bootstrap,
        length: bootstrap?.length || 0
      })
    } else {
      this.logger.info('identity-manager', 'bootstrap_skipped', {
        reason: 'already_bootstrapped'
      })
    }

    return {
      core,
      behavioralRules,
      preferences,
      bootstrap
    }
  }

  /**
   * Save user preferences from bootstrap.
   *
   * @param {Object} answers - Bootstrap answers
   * @returns {Promise<void>}
   */
  async saveBootstrapAnswers(answers) {
    await this.preferencesManager.saveBootstrapAnswers(answers)
    this.isBootstrapped = true

    this.logger.info('identity-manager', 'bootstrap_complete', {
      answersCount: Object.keys(answers).length
    })
  }

  /**
   * Delete BOOTSTRAP.md to mark bootstrap as complete.
   * Called by post-processor when bot includes <bootstrap-complete/> tag.
   *
   * @returns {Promise<void>}
   */
  async deleteBootstrap() {
    const bootstrapPath = this.preferencesManager.bootstrapPath

    try {
      const { unlink } = await import('node:fs/promises')
      await unlink(bootstrapPath)
      this.isBootstrapped = true

      this.logger.info('identity-manager', 'bootstrap_deleted', {
        path: bootstrapPath
      })
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.error('identity-manager', 'bootstrap_delete_failed', {
          error: error.message
        })
        throw error
      }
    }
  }

  /**
   * Update a single preference.
   *
   * @param {string} key - Preference key
   * @param {string} value - Preference value
   * @returns {Promise<void>}
   */
  async updatePreference(key, value) {
    await this.preferencesManager.updatePreference(key, value)

    this.logger.info('identity-manager', 'preference_updated', { key })
  }

  /**
   * Add a new behavioral rule.
   * Requires user approval (saved to proposals first).
   *
   * @param {Object} rule - Rule object
   * @returns {Promise<string>} Proposal ID
   */
  async proposeRule(rule) {
    // Phase 6: Implement proposal workflow
    this.logger.info('identity-manager', 'rule_proposed', {
      category: rule.category
    })

    return 'proposal-id-placeholder'
  }

  /**
   * Get current identity status.
   *
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const rules = await this.rulesEngine.loadRules()

    return {
      isBootstrapped: this.isBootstrapped,
      rulesCount: {
        behavioral: rules?.behavioral?.length || 0,
        forbidden: rules?.forbidden?.length || 0
      },
      hasPreferences: await this.preferencesManager.hasPreferences()
    }
  }
}
