#!/usr/bin/env node

import paths from './paths.js'

const args = process.argv.slice(2)
const subcommand = args[0] || 'help'

const commands = {
  init:              () => import('./cli/init.js'),
  start:             () => import('./cli/start.js'),
  stop:              () => import('./cli/stop.js'),
  restart:           () => import('./cli/restart.js'),
  status:            () => import('./cli/status.js'),
  logs:              () => import('./cli/logs.js'),
  update:            () => import('./cli/update.js'),
  backup:            () => import('./cli/backup.js'),
  config:            () => import('./cli/config-cmd.js'),
  migrate:           () => import('./cli/migrate.js'),
  audit:             () => import('./cli/audit.js'),
  'install-service': () => import('./cli/install-service.js'),
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
