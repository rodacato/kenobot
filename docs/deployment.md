# Deployment

> Running KenoBot on a VPS with auto-recovery and backups. Designed for a $4/month Hetzner server (2vCPU, 4GB RAM, 40GB disk).

## Requirements

- Node.js 22+ (LTS recommended)
- ~50MB disk for code + dependencies
- ~50MB RAM idle, ~150MB under load
- Network access to Telegram API and Anthropic API

## Installation

```bash
# Clone
git clone https://github.com/rodacato/kenobot.git /opt/kenobot
cd /opt/kenobot

# Install dependencies
npm install --production

# Configure
cp .env.example .env
nano .env  # Set TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS, PROVIDER, etc.
```

## Running

### Direct

```bash
bin/start
```

The startup script validates Node.js version, installs deps if missing, checks for `.env`, and runs the bot.

### With systemd (recommended)

Create a systemd service for automatic startup and restart:

```bash
sudo nano /etc/systemd/system/kenobot.service
```

```ini
[Unit]
Description=KenoBot Personal AI Assistant
After=network.target

[Service]
Type=simple
User=kenobot
Group=kenobot
WorkingDirectory=/opt/kenobot
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable kenobot
sudo systemctl start kenobot

# Check status
sudo systemctl status kenobot

# View logs
sudo journalctl -u kenobot -f
```

### With the cron-based auto-recovery

If you prefer not to use systemd:

```bash
# Start the bot
bin/start &

# Set up auto-recovery (checks every minute, 180s throttle)
crontab -e
```

```cron
* * * * * /opt/kenobot/bin/auto-recover
```

## Non-Root Setup

Create a dedicated user for the bot process:

```bash
# Create user
sudo useradd -r -m -s /bin/bash kenobot

# Set ownership
sudo chown -R kenobot:kenobot /opt/kenobot

# Protect secrets
sudo chmod 600 /opt/kenobot/.env

# Switch to kenobot user to run
sudo -u kenobot bin/start
```

## Backups

### Manual

```bash
bin/backup
# Backup created: ~/.kenobot-backups/kenobot-20260207-143000.tar.gz
```

### Automated (cron)

```cron
# Daily backup at 2 AM, keeps last 30
0 2 * * * /opt/kenobot/bin/backup
```

Override backup location:

```bash
BACKUP_DIR=/mnt/external/backups bin/backup
```

### What's Backed Up

The entire `data/` directory:
- `sessions/` — Conversation history
- `memory/` — Daily logs + MEMORY.md
- `logs/` — Structured JSONL logs
- `scheduler/` — Scheduled task definitions

## Monitoring

### Health check

```bash
bin/health
# ✓ KenoBot is running (PID 12345)
```

### HTTP health endpoint

When `HTTP_ENABLED=true`:

```bash
curl http://localhost:3000/health
```

### Structured logs

```bash
# Tail today's logs
tail -f data/logs/kenobot-$(date +%Y-%m-%d).log | jq .

# Find errors
grep '"level":"error"' data/logs/kenobot-$(date +%Y-%m-%d).log | jq .
```

## Updating

```bash
cd /opt/kenobot

# Pull latest
git pull --rebase

# Install any new dependencies
npm install --production

# Restart
sudo systemctl restart kenobot
# or: kill $(cat /tmp/kenobot.pid) && bin/start &
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

For external webhook access, use a reverse proxy (Caddy, nginx) with TLS:

```
# Caddyfile example
kenobot.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## Complete Cron Setup

```cron
# Auto-recovery every minute
* * * * * /opt/kenobot/bin/auto-recover

# Daily backup at 2 AM
0 2 * * * /opt/kenobot/bin/backup
```

## Troubleshooting

### Bot not responding

1. Check if it's running: `bin/health`
2. Check logs: `tail -20 data/logs/kenobot-$(date +%Y-%m-%d).log`
3. Check `.env` has correct `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_CHAT_IDS`
4. Try restarting: `kill $(cat /tmp/kenobot.pid) && bin/start`

### "Config missing" error on startup

Required env vars: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_CHAT_IDS`. Check your `.env` file.

### Claude CLI hanging

The `claude-cli` provider uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` to prevent stdin hanging. If it still hangs, switch to `claude-api`.

### High memory usage

Check with: `curl localhost:3000/health | jq .memory`

Normal idle: ~50MB RSS. If growing unbounded, check for:
- Large session files (data/sessions/) — consider archiving old ones
- Many scheduled tasks — list and remove unused ones
