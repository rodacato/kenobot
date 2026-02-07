# Health & Recovery

> PID-based health checks, automatic restart with throttling, and data backups.

## Overview

KenoBot includes three operational scripts in `bin/`:

| Script | Purpose | How to Use |
|--------|---------|-----------|
| `bin/health` | Check if the bot is running | Run manually or from cron |
| `bin/auto-recover` | Restart if down, with throttling | Run via cron every minute |
| `bin/backup` | Backup data directory | Run via cron daily |

## Health Checks

### PID File

On startup, the bot writes its PID to `/tmp/kenobot.pid`. On graceful shutdown (SIGTERM, SIGINT), it removes the file.

### bin/health

Checks if the process is running by reading the PID file and signaling the process:

```bash
bin/health
# ✓ KenoBot is running (PID 12345)
# Exit code: 0

# or

# ✗ KenoBot is not running
# Exit code: 1
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

## Auto-Recovery

### bin/auto-recover

Checks health and restarts the bot if it's down. Includes a **180-second throttle** to prevent restart loops.

```bash
bin/auto-recover
```

How it works:
1. Runs `bin/health`
2. If healthy → exits silently
3. If down → checks last restart time (stored in `/tmp/kenobot.last_restart`)
4. If last restart was < 180 seconds ago → throttled, exits with error
5. Otherwise → runs `bin/start &` and records restart time

### Cron Setup

Add to crontab for automatic recovery:

```bash
crontab -e
```

```cron
* * * * * /path/to/kenobot/bin/auto-recover
```

This checks every minute. With the 180-second throttle, the bot will restart at most once every 3 minutes.

## Backups

### bin/backup

Creates a compressed tarball of the `data/` directory with automatic rotation:

```bash
bin/backup
# Backup created: /home/user/.kenobot-backups/kenobot-20260207-143000.tar.gz
```

- Default backup location: `$HOME/.kenobot-backups/`
- Override with `BACKUP_DIR` environment variable
- Keeps the last 30 backups, deletes older ones
- Skips if no `data/` directory exists

### Cron Setup

Daily backup at 2 AM:

```cron
0 2 * * * /path/to/kenobot/bin/backup
```

### What's Backed Up

```
data/
  sessions/         # Conversation history (JSONL)
  memory/           # Daily logs + MEMORY.md
  logs/             # Structured logs
  scheduler/        # Scheduled task definitions
```

## Graceful Shutdown

The bot handles shutdown signals:

- **SIGTERM**: Graceful shutdown (removes PID file, stops scheduler, stops channels)
- **SIGINT**: Same as SIGTERM (Ctrl+C)
- **Uncaught exceptions**: Logged but don't crash the process
- **Unhandled rejections**: Logged but don't crash the process

## Complete Cron Setup

```cron
# Health check and auto-recovery every minute
* * * * * /path/to/kenobot/bin/auto-recover

# Daily backup at 2 AM
0 2 * * * /path/to/kenobot/bin/backup
```

## Source

- [src/health.js](../src/health.js) — PID management and health status
- [src/index.js](../src/index.js) — Error boundaries and graceful shutdown
- [bin/health](../bin/health) — Health check script
- [bin/auto-recover](../bin/auto-recover) — Auto-recovery with throttling
- [bin/backup](../bin/backup) — Backup with rotation
- [test/core/health.test.js](../test/core/health.test.js) — Tests
