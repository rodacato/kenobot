import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import defaultLogger from '../../../infrastructure/logger.js'
import { APPROVAL_PROPOSED } from '../../../infrastructure/events.js'

/**
 * SelfImprover - Generates improvement proposals from sleep cycle results
 *
 * Analyzes the output of consolidation, error analysis, and pruning
 * to suggest system-level improvements. Proposals are written as
 * markdown files for human review.
 *
 * When Motor System dependencies are provided (bus, toolRegistry, repo),
 * proposals are also submitted as GitHub PRs and the user is notified
 * via the approval workflow.
 *
 * Output: data/sleep/proposals/YYYY-MM-DD.md
 */
export default class SelfImprover {
  constructor(memorySystem, { logger = defaultLogger, dataDir, bus, toolRegistry, repo } = {}) {
    this.memory = memorySystem
    this.logger = logger
    this.proposalDir = dataDir ? join(dataDir, 'sleep', 'proposals') : null
    this.bus = bus || null
    this.toolRegistry = toolRegistry || null
    this.repo = repo || ''
  }

  /**
   * Run self-improvement analysis on sleep cycle results.
   *
   * @param {Object} sleepResults - Results from prior sleep phases
   * @param {Object} sleepResults.consolidation - Consolidator results
   * @param {Object} sleepResults.errorAnalysis - ErrorAnalyzer results
   * @param {Object} sleepResults.pruning - MemoryPruner results
   * @returns {Promise<{proposalsGenerated: number}>}
   */
  async run(sleepResults = {}) {
    this.logger.info('self-improver', 'started', {})

    const proposals = this.generateProposals(sleepResults)

    if (proposals.length > 0 && this.proposalDir) {
      await this._writeProposals(proposals)
    }

    // Create improvement PR via Motor System if available
    let prUrl = null
    if (proposals.length > 0 && this.toolRegistry && this.repo) {
      prUrl = await this._createImprovementPR(proposals)
    }

    // Notify via Nervous System
    if (proposals.length > 0 && this.bus) {
      this.bus.fire(APPROVAL_PROPOSED, {
        type: 'self-improvement',
        proposalCount: proposals.length,
        priorities: [...new Set(proposals.map(p => p.priority))],
        prUrl
      }, { source: 'cognitive' })
    }

    const result = { proposalsGenerated: proposals.length, prUrl }
    this.logger.info('self-improver', 'completed', result)
    return result
  }

  /**
   * Generate improvement proposals from sleep cycle results.
   *
   * @param {Object} sleepResults
   * @returns {Array<{observation: string, suggestion: string, evidence: string, priority: string}>}
   */
  generateProposals(sleepResults = {}) {
    const proposals = []
    const consolidation = sleepResults.consolidation || {}
    const errorAnalysis = sleepResults.errorAnalysis || {}
    const pruning = sleepResults.pruning || {}

    // Check: many episodes but no patterns extracted
    if ((consolidation.episodesProcessed || 0) > 10 && (consolidation.patternsAdded || 0) === 0) {
      proposals.push({
        observation: `${consolidation.episodesProcessed} episodes processed but 0 patterns extracted`,
        suggestion: 'Consider adding more specific memory tags to conversations so patterns can be detected',
        evidence: `Consolidation processed ${consolidation.episodesProcessed} episodes`,
        priority: 'medium'
      })
    }

    // Check: many errors of same type
    if ((errorAnalysis.errorsFound || 0) > 3) {
      proposals.push({
        observation: `${errorAnalysis.errorsFound} errors found in recent logs`,
        suggestion: 'Recurring errors detected — consider adding proactive error handling or circuit breakers',
        evidence: `Error analysis found ${errorAnalysis.errorsFound} errors, extracted ${errorAnalysis.lessonsExtracted || 0} lessons`,
        priority: 'high'
      })
    }

    // Check: heavy working memory pruning
    if ((pruning.workingPruned || 0) > 5) {
      proposals.push({
        observation: `${pruning.workingPruned} stale working memory sessions deleted`,
        suggestion: 'Many sessions are being abandoned — check if the stale threshold is appropriate or if sessions need better lifecycle management',
        evidence: `Memory pruner deleted ${pruning.workingPruned} sessions`,
        priority: 'low'
      })
    }

    // Check: many low-quality patterns pruned
    if ((pruning.patternsPruned || 0) > 3) {
      proposals.push({
        observation: `${pruning.patternsPruned} procedural patterns were pruned due to low confidence`,
        suggestion: 'Pattern extraction may be too aggressive — consider raising the confidence threshold for new patterns',
        evidence: `Memory pruner removed ${pruning.patternsPruned} unused low-confidence patterns`,
        priority: 'medium'
      })
    }

    // Check: no activity at all
    if ((consolidation.episodesProcessed || 0) === 0 &&
        (errorAnalysis.errorsFound || 0) === 0 &&
        (pruning.workingPruned || 0) === 0) {
      proposals.push({
        observation: 'Sleep cycle found nothing to process',
        suggestion: 'System appears idle — verify that memory is being recorded during conversations',
        evidence: 'All sleep cycle phases returned zero counts',
        priority: 'low'
      })
    }

    return proposals
  }

  /**
   * Write proposals to disk as markdown.
   * @private
   */
  async _writeProposals(proposals) {
    await mkdir(this.proposalDir, { recursive: true })

    const date = new Date().toISOString().slice(0, 10)
    const filepath = join(this.proposalDir, `${date}.md`)

    const lines = [`# Sleep Cycle Proposals — ${date}\n`]

    for (let i = 0; i < proposals.length; i++) {
      const p = proposals[i]
      lines.push(`## Proposal ${i + 1} (${p.priority})`)
      lines.push('')
      lines.push(`**Observation:** ${p.observation}`)
      lines.push('')
      lines.push(`**Suggestion:** ${p.suggestion}`)
      lines.push('')
      lines.push(`**Evidence:** ${p.evidence}`)
      lines.push('')
    }

    await writeFile(filepath, lines.join('\n'), 'utf8')
    this.logger.info('self-improver', 'proposals_written', { filepath, count: proposals.length })
  }

  /**
   * List recent proposals.
   *
   * @param {number} limit - Max proposals to return
   * @returns {Promise<Array<{date: string, content: string}>>}
   */
  async listProposals(limit = 5) {
    if (!this.proposalDir) return []

    try {
      const files = await readdir(this.proposalDir)
      const mdFiles = files
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, limit)

      const proposals = []
      for (const file of mdFiles) {
        const content = await readFile(join(this.proposalDir, file), 'utf8')
        proposals.push({ date: file.replace('.md', ''), content })
      }

      return proposals
    } catch {
      return []
    }
  }

  /**
   * Create an improvement PR via the Motor System.
   *
   * Flow: setup workspace → write proposals → commit → push → create PR.
   * Fails gracefully — returns null if any step fails.
   *
   * @private
   * @param {Array} proposals
   * @returns {Promise<string|null>} PR URL or null
   */
  async _createImprovementPR(proposals) {
    const date = new Date().toISOString().slice(0, 10)
    const slug = this._slugify(proposals[0].observation)
    const branch = `improve/${date}-${slug}`

    try {
      // Setup workspace with new branch
      const setup = await this.toolRegistry.executeTool('github_setup_workspace', {
        repo: this.repo,
        branch
      })
      if (setup.isError) throw new Error(setup.result)

      // Write proposals as markdown
      const content = this._formatProposalMarkdown(proposals, date)
      const write = await this.toolRegistry.executeTool('write_file', {
        repo: this.repo,
        path: `docs/proposals/${date}.md`,
        content
      })
      if (write.isError) throw new Error(write.result)

      // Commit and push
      const commit = await this.toolRegistry.executeTool('run_command', {
        repo: this.repo,
        command: `git add docs/proposals/ && git commit -m "docs: sleep cycle improvement proposals for ${date}"`
      })
      if (commit.isError) throw new Error(commit.result)

      const push = await this.toolRegistry.executeTool('run_command', {
        repo: this.repo,
        command: 'git push -u origin HEAD'
      })
      if (push.isError) throw new Error(push.result)

      // Create PR
      const title = `Self-improvement proposals — ${date}`
      const pr = await this.toolRegistry.executeTool('run_command', {
        repo: this.repo,
        command: `gh pr create --title '${title}' --body 'Auto-generated improvement proposals from sleep cycle analysis.'`
      })
      if (pr.isError) throw new Error(pr.result)

      const prUrl = pr.result?.trim() || null
      this.logger.info('self-improver', 'pr_created', { branch, prUrl })
      return prUrl
    } catch (error) {
      this.logger.warn('self-improver', 'pr_creation_failed', { error: error.message, branch })
      return null
    }
  }

  /**
   * Create a URL-safe slug from text.
   * @private
   */
  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
  }

  /**
   * Format proposals as markdown for PR content.
   * @private
   */
  _formatProposalMarkdown(proposals, date) {
    const lines = [`# Improvement Proposals — ${date}\n`]
    lines.push('Generated by the sleep cycle self-improvement analysis.\n')

    for (let i = 0; i < proposals.length; i++) {
      const p = proposals[i]
      lines.push(`## ${i + 1}. ${p.observation} (${p.priority})`)
      lines.push('')
      lines.push(`**Suggestion:** ${p.suggestion}`)
      lines.push('')
      lines.push(`**Evidence:** ${p.evidence}`)
      lines.push('')
    }

    return lines.join('\n')
  }
}
