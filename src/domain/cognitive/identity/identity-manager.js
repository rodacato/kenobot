import CoreLoader from './core-loader.js'
import RulesEngine from './rules-engine.js'
import PreferencesManager from './preferences-manager.js'
import BootstrapOrchestrator from './bootstrap-orchestrator.js'
import ProfileInferrer from './profile-inferrer.js'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * IdentityManager - Manages bot identity, rules, and preferences
 *
 * Coordinates three aspects of identity:
 * 1. Core: Immutable personality (core.md)
 * 2. Rules: Behavioral guidelines (rules.json)
 * 3. Preferences: User-specific learned preferences (preferences.md)
 *
 * Phase 5: Basic loading and injection
 * Phase 6: Natural conversational bootstrap with observation + inference
 */
export default class IdentityManager {
  constructor(identityPath, provider, { logger = defaultLogger } = {}) {
    this.identityPath = identityPath
    this.provider = provider
    this.logger = logger

    // Initialize components
    this.coreLoader = new CoreLoader(identityPath, { logger })
    this.rulesEngine = new RulesEngine(identityPath, { logger })
    this.preferencesManager = new PreferencesManager(identityPath, { logger })

    // New: Bootstrap orchestration
    this.bootstrapOrchestrator = new BootstrapOrchestrator({ logger })
    this.profileInferrer = provider ? new ProfileInferrer(provider, { logger }) : null

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

    this.logger.debug('identity-manager', 'loaded', {
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
   * @returns {Promise<{core: string, behavioralRules: string, preferences: string, bootstrap: string|null, isBootstrapping: boolean}>}
   */
  async buildContext() {
    const { core, rules, preferences } = await this.load()

    // Convert rules to natural language instructions
    const behavioralRules = this.rulesEngine.formatRulesForPrompt(rules)

    // CRITICAL: Always check disk, never trust cached state
    const isBootstrapping = await this.isBootstrapping()

    // Load bootstrap instructions if not complete
    let bootstrap = null
    if (isBootstrapping) {
      bootstrap = await this.preferencesManager.getBootstrapInstructions()
      this.logger.debug('identity-manager', 'bootstrap_loading', {
        hasBootstrap: !!bootstrap,
        length: bootstrap?.length || 0
      })
    } else {
      this.logger.debug('identity-manager', 'bootstrap_skipped', {
        reason: 'already_bootstrapped'
      })
    }

    return {
      core,
      behavioralRules,
      preferences,
      bootstrap,
      isBootstrapping
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

  /**
   * Initialize conversational bootstrap.
   * Called when bot starts and BOOTSTRAP.md exists.
   *
   * @returns {Object} Bootstrap state
   */
  initializeBootstrap() {
    const state = this.bootstrapOrchestrator.initialize()

    this.logger.info('identity-manager', 'bootstrap_initialized', {
      phase: state.phase
    })

    return state
  }

  /**
   * Process message during bootstrap.
   * Infers user profile and decides next action.
   *
   * @param {string} message - User message
   * @param {Array<Object>} recentMessages - Recent conversation for inference
   * @returns {Promise<Object>} { phase, action, message?, needsResponse }
   */
  async processBootstrapMessage(message, recentMessages = []) {
    // Infer profile from conversation (only if we have LLM provider)
    let inferredProfile = null
    if (this.profileInferrer && recentMessages.length >= 2) {
      inferredProfile = await this.profileInferrer.inferProfile(recentMessages)

      this.logger.info('identity-manager', 'profile_inferred', {
        confidence: inferredProfile.confidence,
        tone: inferredProfile.tone,
        language: inferredProfile.language
      })
    }

    // Process message with orchestrator
    const result = this.bootstrapOrchestrator.processMessage(message, inferredProfile)

    // If bootstrap is complete, save preferences
    if (result.action === 'complete') {
      await this.saveBootstrapPreferences()
    }

    return result
  }

  /**
   * Check if preferences file exists and has content.
   *
   * @returns {Promise<boolean>}
   */
  async hasPreferences() {
    return this.preferencesManager.hasPreferences()
  }

  /**
   * Save bootstrap preferences.
   * Does NOT delete BOOTSTRAP.md — the <bootstrap-complete/> post-processor
   * handles that when the LLM naturally wraps up the onboarding conversation.
   */
  async saveBootstrapPreferences() {
    const preferencesContent = this.bootstrapOrchestrator.formatPreferences()

    // Write preferences.md
    const { writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const preferencesPath = join(this.identityPath, 'preferences.md')

    await writeFile(preferencesPath, preferencesContent, 'utf-8')

    this.logger.info('identity-manager', 'bootstrap_preferences_saved', {
      path: preferencesPath
    })
  }

  /**
   * Get bootstrap state for persistence.
   *
   * @returns {Object}
   */
  getBootstrapState() {
    return this.bootstrapOrchestrator.getState()
  }

  /**
   * Load bootstrap state from persistence.
   *
   * @param {Object} state
   */
  loadBootstrapState(state) {
    this.bootstrapOrchestrator.loadState(state)

    this.logger.info('identity-manager', 'bootstrap_state_loaded', {
      phase: state.phase,
      messageCount: state.messageCount
    })
  }

  /**
   * Check if currently in bootstrap mode.
   * CRITICAL: This MUST sync with disk (check if BOOTSTRAP.md exists)
   *
   * @returns {Promise<boolean>}
   */
  async isBootstrapping() {
    // ALWAYS sync with disk - don't rely on memory state
    const bootstrapped = await this.preferencesManager.isBootstrapped()
    this.isBootstrapped = bootstrapped
    return !bootstrapped
  }

  /**
   * Get bootstrap orchestrator (for testing).
   *
   * @returns {BootstrapOrchestrator}
   */
  getBootstrapOrchestrator() {
    return this.bootstrapOrchestrator
  }
}
