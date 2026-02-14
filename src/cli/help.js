export default async function help() {
  console.log(`Usage: kenobot <command> [options]

Commands:
  setup [opts]        Scaffold ~/.kenobot/ directories and config
                      --install-claude   Install Claude Code CLI + configure PATH
                      --install-gemini   Install Gemini CLI
                      --install-n8n      Install n8n workflow automation
                      --install-all      Install all of the above
  init-cognitive      Initialize cognitive architecture in ~/.kenobot/memory/
  dev                 Start with auto-reload (uses ~/.kenobot/ paths)
  start [-d]          Start the bot (foreground, or -d for daemon)
  stop                Stop the daemon
  restart             Stop + start daemon
  status              Show bot health and uptime
  logs [--today]      Tail logs or show a specific day
  config [edit]       Show config or open .env in $EDITOR
  reset [opts]        Reset cognitive system (dev/testing only)
                      --memory    Reset episodes/facts/working memory
                      --identity  Force re-bootstrap (keep memory)
                      --all       Reset everything (fresh start)
                      --yes       Skip confirmation
  sleep [opts]        Run sleep cycle (memory consolidation)
                      --status      Show last run info
                      --proposals   Show recent improvement proposals
  memory [opts]       Show memory statistics
                      --health      Run memory health checks
                      --prune       Run memory pruner
  doctor              Diagnose common problems (config, disk)
  update [--check]    Update to latest release tag
  version             Show version
  help                Show this help`)
}
