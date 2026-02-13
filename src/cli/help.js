export default async function help() {
  console.log(`Usage: kenobot <command> [options]

Commands:
  setup [opts]        Scaffold ~/.kenobot/ directories and config
                      --install-claude   Install Claude Code CLI + configure PATH
                      --install-gemini   Install Gemini CLI
                      --install-n8n      Install n8n workflow automation
                      --install-all      Install all of the above
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
  reset [opts]        Reset cognitive system (dev/testing only)
                      --memory    Reset episodes/facts/working memory
                      --identity  Force re-bootstrap (keep memory)
                      --all       Reset everything (fresh start)
                      --yes       Skip confirmation
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
