export default async function help() {
  console.log(`Usage: kenobot <command> [options]

Commands:
  init                Scaffold ~/.kenobot/ directories and config
  dev                 Start with auto-reload (uses ~/.kenobot/ paths)
  start [-d]          Start the bot (foreground, or -d for daemon)
  stop                Stop the daemon
  restart             Stop + start daemon
  status              Show bot health and uptime
  logs [--today]      Tail logs or show a specific day
  config [edit]       Show config or open .env in $EDITOR
  backup              Backup config/ and data/ to ~/.kenobot/backups/
  purge [opts]        Reset runtime data (sessions, logs, scheduler)
                      --memory  Also clear memory files
                      --all     Clear everything except config
                      --yes     Skip confirmation
                      --no-backup  Skip auto-backup before purge
  doctor              Diagnose common problems (config, skills, disk)
  update [--check]    Update to latest release tag
  migrate <path>      Copy user files from old-style layout
  audit               Run security audit
  install-service     Generate systemd user service
  setup-tunnel        Generate cloudflared tunnel config
  version             Show version
  help                Show this help

Environment:
  KENOBOT_HOME        Override home directory (default: ~/.kenobot)`)
}
