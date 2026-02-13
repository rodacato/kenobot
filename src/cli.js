#!/usr/bin/env node

import { existsSync } from 'node:fs'
import paths from './paths.js'

const args = process.argv.slice(2)
const subcommand = args[0] || 'help'

// Warn if running as root (claude-code doesn't work as root)
if (process.getuid && process.getuid() === 0) {
  console.error('\x1b[33mWarning: Running as root is not recommended.\x1b[0m')
  console.error('The claude-cli provider will not work as root.')
  console.error('Create a dedicated user: sudo adduser kenobot')
  console.error('See: docs/guides/vps-setup.md\n')
}

// First run: suggest kenobot init when ~/.kenobot/ doesn't exist
if (!existsSync(paths.home) && subcommand !== 'init' && subcommand !== 'help' && subcommand !== 'version') {
  console.log('Welcome to KenoBot!\n')
  console.log('Run \x1b[1mkenobot init\x1b[0m first to set up your directories.\n')
  process.exit(0)
}

const commands = {
  init:              () => import('./cli/init.js'),
  'init-cognitive':  () => import('./cli/init-cognitive.js'),
  start:             () => import('./cli/start.js'),
  stop:              () => import('./cli/stop.js'),
  restart:           () => import('./cli/restart.js'),
  status:            () => import('./cli/status.js'),
  logs:              () => import('./cli/logs.js'),
  update:            () => import('./cli/update.js'),
  backup:            () => import('./cli/backup.js'),
  config:            () => import('./cli/config-cmd.js'),
  migrate:           () => import('./cli/migrate.js'),
  purge:             () => import('./cli/purge.js'),
  doctor:            () => import('./cli/doctor.js'),
  audit:             () => import('./cli/audit.js'),
  'install-service': () => import('./cli/install-service.js'),
  'setup-tunnel':    () => import('./cli/setup-tunnel.js'),
  version:           () => import('./cli/version.js'),
  help:              () => import('./cli/help.js'),
}

const loader = commands[subcommand]
if (!loader) {
  console.error(`Unknown command: ${subcommand}`)
  console.error(`Run 'kenobot help' for usage`)
  process.exit(1)
}

try {
  const mod = await loader()
  await mod.default(args.slice(1), paths)
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}
