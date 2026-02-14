# Deployment

> Running KenoBot on a VPS with systemd. Designed for a $4/month Hetzner server (2vCPU, 4GB RAM, 40GB disk).

## Requirements

- Node.js 22+ (LTS recommended)
- ~50MB disk for code + dependencies
- ~50MB RAM idle, ~150MB under load
- Network access to Telegram API and Anthropic API

## Installation

KenoBot has two deployment channels:

| | Stable | Dev |
|---|---|---|
| **Audience** | End users, forks | Maintainer + bot on VPS |
| **Tracks** | Latest release tag | master branch |
| **Updates** | `kenobot update` (tag checkout + rollback) | `kenobot update` (git pull + rollback) |
| **Git remote** | HTTPS (read-only) or SSH | SSH (read+write for PRs) |

### Stable (recommended)

```bash
curl -sSL https://raw.githubusercontent.com/rodacato/kenobot/master/install.sh | sudo bash
# Choose "stable" when prompted for update channel
```

Or pin a specific version:
```bash
KENOBOT_VERSION=v0.3.0 sudo bash install.sh
```

### Dev (contributors / self-hosted bot)

For development, or when the bot should track master and be able to push changes:

```bash
# 1. Set up SSH key for the kenobot user (required for push access)
sudo -iu kenobot
ssh-keygen -t ed25519 -C "kenobot@vps"
cat ~/.ssh/id_ed25519.pub
# → Add to GitHub: Settings → SSH keys (or as deploy key with write access)
exit

# 2. Run installer, choose "dev" channel
sudo bash install.sh
```

The dev channel stays on master. The bot can create branches and PRs if the SSH key has write access.

### Development Install (local)

For local development:

```bash
git clone git@github.com:rodacato/kenobot.git
cd kenobot
npm install
npm link           # Makes 'kenobot' command available globally
kenobot setup       # Scaffold ~/.kenobot/ directories
```

## Configuration

After installation, configure your bot:

```bash
kenobot config edit    # Opens ~/.kenobot/config/.env in $EDITOR
```

Set at minimum:
```bash
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_ALLOWED_USERS=your_chat_id
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

Create a dedicated user for the bot process. The `install.sh` script handles this automatically. For manual setup:

```bash
# Create user
sudo useradd -r -m -s /bin/bash kenobot

# Clone and install as kenobot user
sudo -iu kenobot
git clone git@github.com:rodacato/kenobot.git ~/.kenobot/engine
cd ~/.kenobot/engine && npm install --omit=dev
ln -sf ~/.kenobot/engine/src/cli.js ~/.npm-global/bin/kenobot

# Configure
kenobot setup
kenobot config edit
```

## Backups

### What's Backed Up

```
~/.kenobot/config/        # .env, identities
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

```bash
kenobot update --check     # Check for new version without updating
kenobot update             # Update to latest version
```

The update command auto-detects the channel:

- **Stable** (on a tag): fetches tags, checks out the latest release, runs `npm install`, rolls back on failure.
- **Dev** (on a branch): pulls latest from origin, runs `npm install`, rolls back on failure.

After updating, restart the bot:
```bash
kenobot stop && kenobot start -d
```

## File Layout

```
~/.kenobot/                   # KENOBOT_HOME (override with env var)
  config/
    .env                      # Bot configuration
    identities/kenobot/       # Bot identity (SOUL.md, IDENTITY.md, USER.md)
  data/
    sessions/                 # Per-chat JSONL history
    memory/                   # MEMORY.md + daily logs
    logs/                     # Structured JSONL logs (daily rotation)
    scheduler/                # Cron task definitions
    kenobot.pid               # PID file (when running)
```

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

For external webhook access, use a reverse proxy (Caddy, nginx) with TLS, or a [cloudflared tunnel](guides/cloudflared.md):

```
# Caddyfile example
kenobot.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## Troubleshooting

### General diagnostics

Run the doctor command to check for common problems:

```bash
kenobot doctor
```

Checks: directory structure, config file, provider readiness, identity, stale PID, disk usage, and recent log errors.

### Bot not responding

1. Run `kenobot doctor` to identify the issue
2. Check if it's running: `kenobot status`
3. Check logs: `kenobot logs`
4. Check config: `kenobot config`
5. Try restarting: `kenobot restart`

### "Config missing" error on startup

Run `kenobot setup` to scaffold directories, then `kenobot config edit` to set required variables.

### Claude CLI hanging

The `claude-cli` provider uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` to prevent stdin hanging. If it still hangs, switch to `claude-api`.

### High memory usage

Check with: `curl localhost:3000/health | jq .memory`

Normal idle: ~50MB RSS. If growing unbounded, check for:
- Large session files (`~/.kenobot/data/sessions/`) — consider archiving old ones
- Many scheduled tasks — list and remove unused ones
