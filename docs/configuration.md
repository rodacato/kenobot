# Configuration Reference

All configuration is via environment variables. The config file lives at `~/.kenobot/config/.env` (when installed) or `.env` at the project root (when running from a git clone).

```bash
kenobot config edit                        # Edit ~/.kenobot/config/.env
kenobot config                             # Show current config (secrets redacted)
kenobot start --config config/main.env     # Use alternate config file
```

## Core

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `PROVIDER` | string | `claude-cli` | No | LLM provider: `claude-api`, `claude-cli`, or `mock` |
| `MODEL` | string | `sonnet` | No | Model name passed to provider: `sonnet`, `opus`, `haiku` |
| `IDENTITY_FILE` | string | `identities/kenobot.md` | No | Path to bot personality/system prompt file (relative to config dir or absolute) |
| `DATA_DIR` | string | `~/.kenobot/data` | No | Base directory for sessions, memory, logs, and scheduler data |

## Telegram

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | string | — | **Yes** | Bot token from [@BotFather](https://t.me/botfather) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | string | — | **Yes** | Comma-separated list of allowed Telegram chat IDs. Empty = reject all. |

Get your chat ID from [@userinfobot](https://t.me/userinfobot). For group chats, add the bot to the group and check the logs for the chat ID.

## Claude API Provider

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `ANTHROPIC_API_KEY` | string | — | When `PROVIDER=claude-api` | Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |

## Session

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SESSION_HISTORY_LIMIT` | integer | `20` | No | Number of recent messages to load from session history per request. Lower values reduce context size and cost; higher values give more conversational continuity. |

## Memory

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `MEMORY_DAYS` | integer | `3` | No | Number of recent daily log files to include in context |

## Skills

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SKILLS_DIR` | string | `~/.kenobot/config/skills` | No | Directory to scan for skill plugins |

## Tools

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `MAX_TOOL_ITERATIONS` | integer | `20` | No | Maximum tool execution rounds per message (safety valve) |

## n8n Integration

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `N8N_WEBHOOK_BASE` | string | — | No | Base URL for n8n webhooks (e.g. `https://n8n.example.com/webhook`). When set, enables the `n8n_trigger` tool. |

## HTTP Webhook Channel

The HTTP channel is opt-in. When enabled, it starts a server with two endpoints:
- `POST /webhook` — Receives messages with HMAC-SHA256 signature validation
- `GET /health` — Returns health status JSON

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `HTTP_ENABLED` | boolean | `false` | No | Set to `true` to start the HTTP server |
| `HTTP_PORT` | integer | `3000` | No | Port for the HTTP server |
| `HTTP_HOST` | string | `127.0.0.1` | No | Bind address. Keep as `127.0.0.1` for security; use a reverse proxy for external access. |
| `WEBHOOK_SECRET` | string | — | When `HTTP_ENABLED=true` | HMAC-SHA256 secret for webhook signature validation. Generate with: `openssl rand -hex 32` |
| `HTTP_TIMEOUT` | integer | `60000` | No | Timeout in milliseconds for webhook responses |

## Environment Variable: KENOBOT_HOME

The `KENOBOT_HOME` environment variable overrides the default user home directory (`~/.kenobot`). Useful for isolated development or testing:

```bash
KENOBOT_HOME=/tmp/kenobot-test kenobot start
```

## Example `.env`

```bash
# Required
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_ALLOWED_CHAT_IDS=123456789

# Provider (pick one)
PROVIDER=claude-api
MODEL=sonnet
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional (defaults shown)
# IDENTITY_FILE=identities/kenobot.md
# SESSION_HISTORY_LIMIT=20
# MEMORY_DAYS=3
# MAX_TOOL_ITERATIONS=20

# n8n (optional)
# N8N_WEBHOOK_BASE=https://n8n.example.com/webhook

# HTTP channel (optional)
# HTTP_ENABLED=true
# HTTP_PORT=3000
# HTTP_HOST=127.0.0.1
# WEBHOOK_SECRET=your-secret-here
# HTTP_TIMEOUT=60000
```

## Multi-Instance

Each instance uses its own `.env` file. Variables are isolated per process:

```bash
# ~/.kenobot/config/main.env
PROVIDER=claude-api
MODEL=opus
IDENTITY_FILE=identities/kenobot.md
TELEGRAM_BOT_TOKEN=<main_bot_token>
TELEGRAM_ALLOWED_CHAT_IDS=123456789
DATA_DIR=~/.kenobot/data/main

# ~/.kenobot/config/quick.env
PROVIDER=claude-api
MODEL=haiku
IDENTITY_FILE=identities/quick.md
TELEGRAM_BOT_TOKEN=<quick_bot_token>
TELEGRAM_ALLOWED_CHAT_IDS=123456789
DATA_DIR=~/.kenobot/data/quick
```

Run both:
```bash
kenobot start --config ~/.kenobot/config/main.env &
kenobot start --config ~/.kenobot/config/quick.env &
```

Each instance maintains separate sessions, memory, logs, and scheduled tasks under its own `DATA_DIR`.
