# Health & Recovery

> PID-based health checks and monitoring via the `kenobot` CLI.

## Overview

KenoBot includes CLI commands for monitoring:

| Command | Purpose |
|---------|---------|
| `kenobot status` | Check if the bot is running + uptime |
| `kenobot start -d` | Start as a background daemon |
| `kenobot stop` | Stop the daemon |
| `kenobot restart` | Stop + start -d |

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

## Graceful Shutdown

The bot handles shutdown signals:

- **SIGTERM**: Graceful shutdown (removes PID file, stops scheduler, stops channels)
- **SIGINT**: Same as SIGTERM (Ctrl+C)
- **Uncaught exceptions**: Logged but don't crash the process
- **Unhandled rejections**: Logged but don't crash the process

## Source

- [src/health.js](../../src/health.js) — PID management and health status
- [src/cli/status.js](../../src/cli/status.js) — Status command
- [src/index.js](../../src/index.js) — Error boundaries and graceful shutdown
