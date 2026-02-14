#!/usr/bin/env node

import { rm, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { checkPid } from '../health.js'
import { GREEN, RED, YELLOW, BOLD, NC, exists } from './utils.js'

const ok = (msg) => console.log(`${GREEN}[✓]${NC} ${msg}`)
const warn = (msg) => console.log(`${YELLOW}[!]${NC} ${msg}`)
const error = (msg) => console.log(`${RED}[✗]${NC} ${msg}`)

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

/**
 * Reset cognitive system components (memory, identity, or both)
 *
 * Usage:
 *   kenobot reset --memory      # Reset memory only
 *   kenobot reset --identity    # Reset identity (force re-bootstrap)
 *   kenobot reset --all         # Reset everything
 *   kenobot reset --help        # Show help
 */
export default async function reset(args, paths) {
  const flags = new Set(args)

  if (flags.has('--help') || flags.has('-h')) {
    showHelp()
    return
  }

  const resetMemory = flags.has('--memory') || flags.has('--all')
  const resetIdentity = flags.has('--identity') || flags.has('--all')
  const resetAll = flags.has('--all')
  const skipConfirm = flags.has('--yes') || flags.has('-y')

  if (!resetMemory && !resetIdentity) {
    error('Must specify what to reset: --memory, --identity, or --all')
    console.log(`Run ${BOLD}kenobot reset --help${NC} for usage`)
    process.exit(1)
  }

  // Check bot is not running
  let running = false
  try {
    const pid = await checkPid(paths.pidFile)
    error(`KenoBot is running (PID ${pid}). Stop it first:`)
    console.error('  kenobot stop')
    running = true
  } catch {
    // Not running — good
  }
  if (running) {
    process.exit(1)
    return
  }

  // Define what will be reset
  const operations = []

  if (resetMemory) {
    operations.push({
      name: 'Memory',
      paths: [
        join(paths.home, 'memory', 'episodic'),
        join(paths.home, 'memory', 'semantic'),
        join(paths.home, 'memory', 'working'),
        join(paths.home, 'memory', 'procedural')
      ],
      description: 'All episodes, facts, working memory, and learned patterns'
    })
  }

  if (resetIdentity) {
    operations.push({
      name: 'Identity',
      paths: [
        join(paths.home, 'memory', 'identity', 'preferences.md'),
        join(paths.home, 'data', 'sessions')
      ],
      description: 'User preferences and session history (will trigger re-bootstrap)',
      recreate: [
        {
          path: join(paths.home, 'memory', 'identity', 'BOOTSTRAP.md'),
          template: join(paths.templates, 'identity', 'BOOTSTRAP.md')
        }
      ]
    })
  }

  // Show what will be reset
  console.log(`${BOLD}Reset Cognitive System${NC}`)
  console.log(`${BOLD}Home:${NC} ${paths.home}\n`)

  console.log('Will reset:')
  for (const op of operations) {
    console.log(`  ${RED}✕${NC} ${op.name}: ${op.description}`)
  }

  // Show what will be preserved
  console.log(`\n${GREEN}Preserved:${NC}`)
  if (!resetMemory) {
    console.log('  Memory (episodes, facts, working memory)')
  }
  if (!resetIdentity) {
    console.log('  Identity (preferences.md, core.md, rules.json)')
  }
  console.log('  Core identity files (core.md, rules.json)')
  console.log('  Configuration (.env)')

  // Confirm
  if (!skipConfirm) {
    console.log()
    const yes = await confirm(`${YELLOW}Proceed with reset?${NC} [y/N] `)
    if (!yes) {
      console.log('Aborted.')
      return
    }
  }

  console.log()

  // Perform reset operations
  for (const op of operations) {
    console.log(`${BOLD}Resetting ${op.name}...${NC}`)

    // Remove paths
    for (const path of op.paths) {
      if (await exists(path)) {
        await rm(path, { recursive: true, force: true })
        ok(`Removed ${path.replace(paths.home + '/', '')}`)
      }
    }

    // Recreate directories
    for (const path of op.paths) {
      if (path.endsWith('/') || !path.includes('.')) {
        await mkdir(path, { recursive: true })
        ok(`Recreated ${path.replace(paths.home + '/', '')}`)
      }
    }

    // Recreate files from templates
    if (op.recreate) {
      for (const { path, template } of op.recreate) {
        if (await exists(template)) {
          await copyFile(template, path)
          ok(`Restored ${path.replace(paths.home + '/', '')}`)
        } else {
          warn(`Template not found: ${template}`)
        }
      }
    }
  }

  // Create empty structure files
  if (resetMemory) {
    const semanticPath = join(paths.home, 'memory', 'semantic')
    await mkdir(semanticPath, { recursive: true })

    // Create empty facts.md
    const factsPath = join(semanticPath, 'facts.md')
    await writeFile(factsPath, '# Semantic Memory\n\nNo facts stored yet.\n', 'utf-8')
    ok('Created empty facts.md')

    // Create empty patterns.json
    const proceduraPath = join(paths.home, 'memory', 'procedural', 'patterns.json')
    await mkdir(join(paths.home, 'memory', 'procedural'), { recursive: true })
    await writeFile(proceduraPath, JSON.stringify({ patterns: [] }, null, 2), 'utf-8')
    ok('Created empty patterns.json')
  }

  console.log(`\n${GREEN}Reset complete!${NC}`)

  if (resetIdentity) {
    console.log(`\n${YELLOW}Next time you start the bot, it will re-run the bootstrap process.${NC}`)
  }

  if (resetAll) {
    console.log(`\n${YELLOW}Fresh start! The bot will learn from scratch.${NC}`)
  }
}

function showHelp() {
  console.log(`
${BOLD}kenobot reset${NC} - Reset cognitive system components

${BOLD}USAGE${NC}
  kenobot reset [OPTIONS]

${BOLD}OPTIONS${NC}
  ${BOLD}--memory${NC}      Reset memory only (episodes, facts, working memory)
                 Preserves: identity (preferences, core, rules)

  ${BOLD}--identity${NC}    Reset identity only (force re-bootstrap)
                 Preserves: memory (episodes, facts)
                 Effect: Next start will run bootstrap conversation again

  ${BOLD}--all${NC}         Reset everything (memory + identity)
                 Fresh start, bot learns from scratch

  ${BOLD}--yes, -y${NC}     Skip confirmation prompt

  ${BOLD}--help, -h${NC}    Show this help

${BOLD}EXAMPLES${NC}
  # Reset memory, keep identity
  kenobot reset --memory

  # Force re-bootstrap (keep memory)
  kenobot reset --identity

  # Complete reset (fresh start)
  kenobot reset --all

  # Skip confirmation
  kenobot reset --memory --yes

${BOLD}NOTES${NC}
  - Bot must be stopped before reset
  - Core identity files (core.md, rules.json) are never deleted
  - Reset is immediate and cannot be undone
  - For development/testing use only
`)
}
