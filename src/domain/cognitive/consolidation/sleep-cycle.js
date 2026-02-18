import Consolidator from './consolidator.js'
import ErrorAnalyzer from './error-analyzer.js'
import MemoryPruner from './memory-pruner.js'
import SelfImprover from './self-improver.js'
import ReflectionEngine from '../metacognition/reflection-engine.js'
import defaultLogger from '../../../infrastructure/logger.js'

/**
 * SleepCycle - Orchestrates nightly memory consolidation
 *
 * Runs at 4am (or manually via `kenobot sleep`) to:
 * 1. Consolidate episodic → semantic/procedural
 * 2. Analyze errors and extract lessons
 * 3. Prune stale/redundant memory
 * 4. Generate self-improvement proposals
 * 5. Reflect on results (consciousness-enhanced insights)
 *
 * Phase 4: Basic orchestration with resilience
 * Phase 6: ML-based consolidation (embeddings, clustering)
 */
export default class SleepCycle {
  constructor(memorySystem, { logger = defaultLogger, dataDir, bus, toolRegistry, repo, consciousness } = {}) {
    this.memory = memorySystem
    this.logger = logger

    // Initialize consolidation components (all receive consciousness for enhanced analysis)
    this.consolidator = new Consolidator(memorySystem, { logger, consciousness })
    this.errorAnalyzer = new ErrorAnalyzer(memorySystem, { logger, consciousness })
    this.pruner = new MemoryPruner(memorySystem, { logger, consciousness })
    this.selfImprover = new SelfImprover(memorySystem, { logger, dataDir, bus, toolRegistry, repo, consciousness })
    this.reflectionEngine = new ReflectionEngine({ logger, consciousness })

    this.state = {
      lastRun: null,
      status: 'idle', // idle | running | success | failed
      currentPhase: null,
      error: null
    }
  }

  /**
   * Execute the full sleep cycle.
   * Resilient: saves state on each phase completion.
   *
   * @returns {Promise<{success: boolean, phases: Object, duration: number}>}
   */
  async run() {
    const startTime = Date.now()
    this.state.status = 'running'
    this.state.error = null

    const results = {
      consolidation: null,
      errorAnalysis: null,
      pruning: null,
      selfImprovement: null,
      reflection: null
    }

    try {
      // Phase 1: Consolidation (episodes → semantic/procedural)
      this.state.currentPhase = 'consolidation'
      this.logger.info('sleep-cycle', 'phase_start', { phase: 'consolidation' })
      results.consolidation = await this.consolidator.run()

      // Phase 2: Error Analysis
      this.state.currentPhase = 'error-analysis'
      this.logger.info('sleep-cycle', 'phase_start', { phase: 'error-analysis' })
      results.errorAnalysis = await this.errorAnalyzer.run()

      // Phase 3: Memory Pruning
      this.state.currentPhase = 'pruning'
      this.logger.info('sleep-cycle', 'phase_start', { phase: 'pruning' })
      results.pruning = await this.pruner.run()

      // Phase 4: Self-Improvement Proposals
      this.state.currentPhase = 'self-improvement'
      this.logger.info('sleep-cycle', 'phase_start', { phase: 'self-improvement' })
      results.selfImprovement = await this.selfImprover.run(results)

      // Phase 5: Reflection (consciousness-enhanced meta-analysis)
      this.state.currentPhase = 'reflection'
      this.logger.info('sleep-cycle', 'phase_start', { phase: 'reflection' })
      results.reflection = await this.reflectionEngine.reflectEnhanced(results)

      // Success
      this.state.status = 'success'
      this.state.lastRun = new Date().toISOString()
      this.state.currentPhase = null

      const duration = Date.now() - startTime

      this.logger.info('sleep-cycle', 'completed', {
        duration,
        lastRun: this.state.lastRun
      })

      return {
        success: true,
        phases: results,
        duration
      }
    } catch (error) {
      this.state.status = 'failed'
      this.state.error = error.message

      this.logger.error('sleep-cycle', 'failed', {
        phase: this.state.currentPhase,
        error: error.message,
        stack: error.stack
      })

      return {
        success: false,
        phases: results,
        duration: Date.now() - startTime,
        error: error.message
      }
    }
  }

  /**
   * Get current sleep cycle state.
   *
   * @returns {Object} State object with status, lastRun, etc.
   */
  getState() {
    return { ...this.state }
  }

  /**
   * Check if sleep cycle should run based on last run time.
   * Default: once per day (configurable threshold)
   *
   * @param {number} minHoursBetweenRuns - Minimum hours between runs (default: 20)
   * @returns {boolean}
   */
  shouldRun(minHoursBetweenRuns = 20) {
    if (!this.state.lastRun) return true

    const lastRunTime = new Date(this.state.lastRun).getTime()
    const hoursSinceLastRun = (Date.now() - lastRunTime) / (1000 * 60 * 60)

    return hoursSinceLastRun >= minHoursBetweenRuns
  }
}
