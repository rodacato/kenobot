# Health & Recovery

> PID-based health checks, systemd integration, and data backups via the `kenobot` CLI.

## Overview

KenoBot includes CLI commands for monitoring and recovery:

| Command | Purpose |
|---------|---------|
| `kenobot status` | Check if the bot is running + uptime |
| `kenobot start -d` | Start as a background daemon |
| `kenobot stop` | Stop the daemon |
| `kenobot restart` | Stop + start -d |
| `kenobot backup` | Backup config and data directories |
| `kenobot install-service` | Generate systemd user service |

## Health Checks

### PID File

On startup, the bot writes its PID to `~/.kenobot/data/kenobot.pid`. On graceful shutdown (SIGTERM, SIGINT), it removes the file.

### kenobot status

Checks if the process is running by reading the PID file and signaling the process:

```bash
kenobot status
# KenoBot is running (PID 12345)
# Uptime: 2d 5h 30m
# Config: ~/.kenobot/config/.env
# Data:   ~/.kenobot/data

# or

# KenoBot is not running
```

### HTTP Health Endpoint

When the HTTP channel is enabled, `GET /health` returns:

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "pid": 12345,
  "uptime": 3600,
  "memory": {"rss": 45, "heap": 20},
  "timestamp": 1707307200000
}
```

## Systemd Integration

For automatic startup and restart on a VPS:

```bash
kenobot install-service
```

This generates `~/.config/systemd/user/kenobot.service` and enables it:

```bash
systemctl --user start kenobot     # Start
systemctl --user status kenobot    # Check status
systemctl --user stop kenobot      # Stop
journalctl --user -u kenobot -f   # View logs

# For auto-start on boot:
loginctl enable-linger $USER
```

## Backups

### kenobot backup

Creates a compressed tarball of `~/.kenobot/config/` and `~/.kenobot/data/` with automatic rotation:

```bash
kenobot backup
# Backup created: ~/.kenobot/backups/kenobot-20260207-143000.tar.gz
```

- Default backup location: `~/.kenobot/backups/`
- Keeps the last 30 backups, deletes older ones

### Cron Setup

Daily backup at 2 AM:

```cron
0 2 * * * kenobot backup
```

### What's Backed Up

```
~/.kenobot/config/        # .env, identities, skills
~/.kenobot/data/
  sessions/               # Conversation history (JSONL)
  memory/                 # Daily logs + MEMORY.md
  logs/                   # Structured logs
  scheduler/              # Scheduled task definitions
```

## Graceful Shutdown

The bot handles shutdown signals:

- **SIGTERM**: Graceful shutdown (removes PID file, stops scheduler, stops channels)
- **SIGINT**: Same as SIGTERM (Ctrl+C)
- **Uncaught exceptions**: Logged but don't crash the process
- **Unhandled rejections**: Logged but don't crash the process

## Source

- [src/health.js](../../src/health.js) — PID management and health status
- [src/cli/status.js](../../src/cli/status.js) — Status command
- [src/cli/backup.js](../../src/cli/backup.js) — Backup command
- [src/cli/install-service.js](../../src/cli/install-service.js) — Systemd service
- [src/index.js](../../src/index.js) — Error boundaries and graceful shutdown
