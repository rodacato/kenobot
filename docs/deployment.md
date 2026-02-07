# Deployment

> Running KenoBot on a VPS with systemd and backups. Designed for a $4/month Hetzner server (2vCPU, 4GB RAM, 40GB disk).

## Requirements

- Node.js 22+ (LTS recommended)
- ~50MB disk for code + dependencies
- ~50MB RAM idle, ~150MB under load
- Network access to Telegram API and Anthropic API

## Installation

### Quick Install (recommended)

```bash
npm install -g github:rodacato/kenobot
kenobot init
```

This installs the `kenobot` CLI globally and scaffolds user directories at `~/.kenobot/`.

### Pin a Specific Version

```bash
npm install -g github:rodacato/kenobot#v0.2.0
```

### Development Install

For development or contributing:

```bash
git clone https://github.com/rodacato/kenobot.git
cd kenobot
npm install
npm link           # Makes 'kenobot' command available globally
kenobot init       # Scaffold ~/.kenobot/ directories
```

## Configuration

After installation, configure your bot:

```bash
kenobot config edit    # Opens ~/.kenobot/config/.env in $EDITOR
```

Set at minimum:
```bash
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_ALLOWED_CHAT_IDS=your_chat_id
PROVIDER=claude-api
MODEL=sonnet
ANTHROPIC_API_KEY=sk-ant-api03-...
```

View current config (secrets redacted):
```bash
kenobot config
```

## Running

### Foreground

```bash
kenobot start
```

### Daemon (background)

```bash
kenobot start -d       # Start as daemon
kenobot status         # Check if running + uptime
kenobot stop           # Stop daemon
kenobot restart        # Stop + start -d
```

### With systemd (recommended for VPS)

Generate and enable a systemd user service:

```bash
kenobot install-service
```

This creates `~/.config/systemd/user/kenobot.service` and enables it. Then:

```bash
systemctl --user start kenobot     # Start
systemctl --user status kenobot    # Check status
systemctl --user stop kenobot      # Stop
journalctl --user -u kenobot -f   # View logs

# For auto-start on boot:
loginctl enable-linger $USER
```

## Non-Root Setup

> **Important**: Do not run KenoBot as root. The `claude-cli` provider depends on `claude` (Claude Code CLI), which does not work as the root user. KenoBot will warn you if it detects root.

Create a dedicated user for the bot process:

```bash
# Create user
sudo useradd -r -m -s /bin/bash kenobot

# Switch to kenobot user and install
sudo -u kenobot bash
npm install -g github:rodacato/kenobot

# Configure
kenobot config edit

# Install systemd service
kenobot install-service
```

## Backups

### Manual

```bash
kenobot backup
# Backup created: ~/.kenobot/backups/kenobot-20260207-143000.tar.gz
```

Backs up `~/.kenobot/config/` and `~/.kenobot/data/`. Keeps the last 30 backups.

### Automated (cron)

```cron
# Daily backup at 2 AM
0 2 * * * kenobot backup
```

### What's Backed Up

```
~/.kenobot/config/        # .env, identities, skills
~/.kenobot/data/
  sessions/               # Conversation history
  memory/                 # Daily logs + MEMORY.md
  logs/                   # Structured JSONL logs
  scheduler/              # Scheduled task definitions
```

## Monitoring

### Status check

```bash
kenobot status
# KenoBot is running (PID 12345)
# Uptime: 2d 5h 30m
# Config: ~/.kenobot/config/.env
# Data:   ~/.kenobot/data
```

### Logs

```bash
kenobot logs              # Tail latest log
kenobot logs --today      # Today's full log
kenobot logs --date 2026-02-06   # Specific date
```

### HTTP health endpoint

When `HTTP_ENABLED=true`:

```bash
curl http://localhost:3000/health
```

## Updating

### npm install

```bash
npm update -g kenobot
```

### Development install (git)

```bash
kenobot update --check     # Check for new version without updating
kenobot update             # Update to latest release tag
```

The git update command fetches latest tags, checks out the new version, runs `npm install`, and rolls back on failure.

## Security Audit

```bash
kenobot audit
```

Checks for exposed secrets, file permissions, and common security issues.

## File Layout

```
~/.kenobot/                   # KENOBOT_HOME (override with env var)
  config/
    .env                      # Bot configuration
    identities/kenobot/       # Bot identity (SOUL.md, IDENTITY.md, USER.md)
    skills/                   # Skill plugins
  data/
    sessions/                 # Per-chat JSONL history
    memory/                   # MEMORY.md + daily logs
    logs/                     # Structured JSONL logs (daily rotation)
    scheduler/                # Cron task definitions
    kenobot.pid               # PID file (when running)
  backups/                    # Backup archives (tar.gz)
```

## Integrations

KenoBot supports optional integrations for GitHub, n8n automation, Cloudflare tunnels, and Gmail.

See **[Integrations Guide](integrations-guide.md)** for complete step-by-step setup of each integration.

| Integration | What it does | Key env vars |
|-------------|-------------|--------------|
| **GitHub Workspace** | Bot's own repo for skills, workflows, notes | `WORKSPACE_DIR`, `KENOBOT_SSH_KEY` |
| **n8n** | 400+ service integrations (Gmail, calendar, etc.) | `N8N_WEBHOOK_BASE`, `N8N_API_URL` |
| **Cloudflare Tunnel** | Expose webhooks securely, no open ports | `HTTP_ENABLED`, `WEBHOOK_SECRET` |
| **Gmail** | Email via n8n workflows | (uses n8n, no extra config) |
| **Self-Improvement** | Bot creates its own skills/workflows | `SELF_IMPROVEMENT_ENABLED` |

## Firewall

If using the HTTP channel, ensure the port is not directly exposed:

```bash
# HTTP binds to 127.0.0.1 by default (safe)
# Only expose via reverse proxy if needed

# If using UFW:
sudo ufw allow 22/tcp    # SSH
sudo ufw deny 3000/tcp   # Block direct HTTP access
sudo ufw enable
```

For external webhook access, use a reverse proxy (Caddy, nginx) with TLS:

```
# Caddyfile example
kenobot.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## Troubleshooting

### Bot not responding

1. Check if it's running: `kenobot status`
2. Check logs: `kenobot logs`
3. Check config: `kenobot config`
4. Try restarting: `kenobot restart`

### "Config missing" error on startup

Run `kenobot init` to scaffold directories, then `kenobot config edit` to set required variables.

### Claude CLI hanging

The `claude-cli` provider uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` to prevent stdin hanging. If it still hangs, switch to `claude-api`.

### Resetting state

To start fresh without losing your configuration:

```bash
kenobot purge                # Clear sessions, logs, scheduler (preserves memory)
kenobot purge --memory       # Also clear memory files (restores MEMORY.md template)
kenobot purge --all          # Clear everything except config/.env, identities, skills
```

Options:
- `--yes` / `-y` — skip confirmation prompt
- `--no-backup` — skip auto-backup before purge

The bot must be stopped before purging. A backup is created automatically unless `--no-backup` is passed.

### High memory usage

Check with: `curl localhost:3000/health | jq .memory`

Normal idle: ~50MB RSS. If growing unbounded, check for:
- Large session files (`~/.kenobot/data/sessions/`) — consider archiving old ones
- Many scheduled tasks — list and remove unused ones
