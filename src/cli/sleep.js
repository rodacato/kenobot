import { join } from 'node:path'
import MemoryStore from '../storage/memory-store.js'
import CognitiveSystem from '../cognitive/index.js'
import { BOLD, GREEN, YELLOW, DIM, NC } from './utils.js'

/**
 * kenobot sleep          — Run sleep cycle manually
 * kenobot sleep --status — Show last run info
 */
export default async function sleep(args, paths) {
  const dataDir = join(paths.home, 'data')
  const memoryStore = new MemoryStore(dataDir)
  const config = { dataDir, useRetrieval: false, useIdentity: false }
  const cognitive = new CognitiveSystem(config, memoryStore, {})
  const sleepCycle = cognitive.getSleepCycle()

  if (args.includes('--status')) {
    return showStatus(sleepCycle)
  }

  if (args.includes('--proposals')) {
    return showProposals(sleepCycle)
  }

  // Run sleep cycle
  console.log(`${BOLD}Running sleep cycle...${NC}\n`)

  const result = await sleepCycle.run()

  if (result.success) {
    console.log(`${GREEN}Sleep cycle completed${NC} (${result.duration}ms)\n`)
  } else {
    console.log(`${YELLOW}Sleep cycle failed:${NC} ${result.error}\n`)
  }

  // Print phase results
  const phases = result.phases || {}

  console.log(`${BOLD}Consolidation${NC}`)
  const cons = phases.consolidation || {}
  console.log(`  Episodes processed: ${cons.episodesProcessed || 0}`)
  console.log(`  Facts added:        ${cons.factsAdded || 0}`)
  console.log(`  Patterns added:     ${cons.patternsAdded || 0}`)

  console.log(`\n${BOLD}Error Analysis${NC}`)
  const err = phases.errorAnalysis || {}
  console.log(`  Errors found:       ${err.errorsFound || 0}`)
  console.log(`  Lessons extracted:  ${err.lessonsExtracted || 0}`)

  console.log(`\n${BOLD}Pruning${NC}`)
  const prune = phases.pruning || {}
  console.log(`  Working pruned:     ${prune.workingPruned || 0}`)
  console.log(`  Patterns pruned:    ${prune.patternsPruned || 0}`)
  console.log(`  Episodes compressed:${prune.episodesCompressed || 0}`)

  console.log(`\n${BOLD}Self-Improvement${NC}`)
  const si = phases.selfImprovement || {}
  console.log(`  Proposals generated:${si.proposalsGenerated || 0}`)

  console.log()
}

function showStatus(sleepCycle) {
  const state = sleepCycle.getState()

  console.log(`${BOLD}Sleep Cycle Status${NC}\n`)
  console.log(`  Status:     ${state.status}`)
  console.log(`  Last run:   ${state.lastRun || 'never'}`)
  console.log(`  Phase:      ${state.currentPhase || 'idle'}`)
  console.log(`  Error:      ${state.error || 'none'}`)
  console.log(`  Should run: ${sleepCycle.shouldRun() ? 'yes' : 'no'}`)
  console.log()
}

async function showProposals(sleepCycle) {
  const selfImprover = sleepCycle.selfImprover

  if (!selfImprover) {
    console.log('No self-improver configured')
    return
  }

  const proposals = await selfImprover.listProposals(5)

  if (proposals.length === 0) {
    console.log(`${DIM}No proposals found${NC}`)
    return
  }

  console.log(`${BOLD}Recent Proposals${NC}\n`)
  for (const proposal of proposals) {
    console.log(`${DIM}--- ${proposal.filename} ---${NC}`)
    console.log(proposal.content)
    console.log()
  }
}
