import { join } from 'node:path'
import MemoryStore from '../adapters/storage/memory-store.js'
import MemorySystem from '../domain/cognitive/memory/memory-system.js'
import MemoryHealthChecker from '../domain/cognitive/utils/memory-health.js'
import SleepCycle from '../domain/cognitive/consolidation/sleep-cycle.js'
import { BOLD, GREEN, YELLOW, DIM, NC, formatBytes } from './utils.js'

/**
 * kenobot memory          — Show memory stats
 * kenobot memory --health — Run health checks
 * kenobot memory --prune  — Run pruner only
 */
export default async function memory(args, paths) {
  const memoryDir = join(paths.home, 'memory')
  const memoryStore = new MemoryStore(memoryDir)
  const memorySystem = new MemorySystem(memoryStore)

  if (args.includes('--health')) {
    return showHealth(memorySystem, join(paths.home, 'data'))
  }

  if (args.includes('--prune')) {
    return runPrune(memorySystem)
  }

  // Show memory stats
  await showStats(memorySystem, memoryStore)
}

async function showStats(memorySystem, store) {
  console.log(`${BOLD}Memory Statistics${NC}\n`)

  // Semantic memory (long-term facts)
  let factSize = 0
  try {
    const facts = await memorySystem.getLongTermMemory()
    factSize = facts ? Buffer.byteLength(facts, 'utf8') : 0
    const lineCount = facts ? facts.split('\n').filter(l => l.trim()).length : 0
    console.log(`  ${BOLD}Semantic${NC}`)
    console.log(`    Long-term facts: ${lineCount} lines (${formatBytes(factSize)})`)
  } catch {
    console.log(`  ${BOLD}Semantic${NC}`)
    console.log(`    ${DIM}No long-term memory${NC}`)
  }

  // Chat sessions
  try {
    const sessions = await store.listChatSessions()
    console.log(`    Chat sessions:   ${sessions.length}`)
  } catch {
    console.log(`    Chat sessions:   ${DIM}unknown${NC}`)
  }

  // Working memory
  try {
    const sessions = await store.listWorkingMemorySessions()
    const active = sessions.filter(s => {
      const age = Date.now() - s.updatedAt
      return age < 7 * 24 * 60 * 60 * 1000
    })
    console.log(`\n  ${BOLD}Working Memory${NC}`)
    console.log(`    Total sessions:  ${sessions.length}`)
    console.log(`    Active (<7d):    ${active.length}`)
    console.log(`    Stale (>7d):     ${sessions.length - active.length}`)
  } catch {
    console.log(`\n  ${BOLD}Working Memory${NC}`)
    console.log(`    ${DIM}No working memory sessions${NC}`)
  }

  // Procedural memory
  try {
    const patterns = await store.readPatterns()
    console.log(`\n  ${BOLD}Procedural${NC}`)
    console.log(`    Patterns:        ${patterns.length}`)
  } catch {
    console.log(`\n  ${BOLD}Procedural${NC}`)
    console.log(`    Patterns:        0`)
  }

  console.log()
}

async function showHealth(memorySystem, dataDir) {
  const sleepCycle = new SleepCycle(memorySystem, { dataDir })
  const healthChecker = new MemoryHealthChecker(memorySystem, sleepCycle)

  console.log(`${BOLD}Memory Health Check${NC}\n`)

  const status = await healthChecker.getHttpStatus()

  const icon = status.status === 'healthy' ? GREEN : YELLOW
  console.log(`  Status: ${icon}${status.status}${NC}`)
  console.log(`  Time:   ${status.timestamp}`)

  if (status.checks) {
    console.log(`\n  ${BOLD}Checks${NC}`)
    for (const [name, check] of Object.entries(status.checks)) {
      const checkIcon = check.status === 'ok' ? GREEN : check.status === 'warning' ? YELLOW : '\x1b[31m'
      console.log(`    ${checkIcon}[${check.status}]${NC} ${name}: ${check.message || ''}`)
    }
  }

  if (status.warnings.length > 0) {
    console.log(`\n  ${YELLOW}Warnings:${NC}`)
    for (const w of status.warnings) {
      console.log(`    - ${w}`)
    }
  }

  if (status.errors.length > 0) {
    console.log(`\n  \x1b[31mErrors:${NC}`)
    for (const e of status.errors) {
      console.log(`    - ${e}`)
    }
  }

  console.log()
}

async function runPrune(memorySystem) {
  // Import pruner lazily
  const { default: MemoryPruner } = await import('../domain/cognitive/consolidation/memory-pruner.js')
  const pruner = new MemoryPruner(memorySystem)

  console.log(`${BOLD}Running memory pruner...${NC}\n`)

  const result = await pruner.run()

  console.log(`  Working memory pruned:  ${result.workingPruned}`)
  console.log(`  Patterns pruned:        ${result.patternsPruned}`)
  console.log(`  Episodes compressed:    ${result.episodesCompressed}`)
  console.log()
}
