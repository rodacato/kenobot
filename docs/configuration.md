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
| `PROVIDER` | string | `claude-cli` | No | LLM provider: `claude-api`, `claude-cli`, `gemini-api`, `gemini-cli`, or `mock` |
| `MODEL` | string | `sonnet` | No | Model name passed to provider: `sonnet`, `opus`, `haiku` |
| `IDENTITY_FILE` | string | `identities/kenobot` | No | Path to bot identity directory or file (relative to config dir or absolute). Directory mode loads SOUL.md + IDENTITY.md + USER.md separately. See [Identity](features/identity.md). |
| `DATA_DIR` | string | `~/.kenobot/data` | No | Base directory for sessions, memory, logs, and scheduler data |

## Telegram

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | string | — | **Yes** | Bot token from [@BotFather](https://t.me/botfather) |
| `TELEGRAM_ALLOWED_USERS` | string | — | One of these | Comma-separated Telegram user IDs. These users can talk to the bot in any chat (DM or group). |
| `TELEGRAM_ALLOWED_CHAT_IDS` | string | — | One of these | Comma-separated Telegram chat IDs. Anyone in these chats can talk to the bot. |

At least one of `TELEGRAM_ALLOWED_USERS` or `TELEGRAM_ALLOWED_CHAT_IDS` must be set.

Get your user ID from [@userinfobot](https://t.me/userinfobot). For group chat IDs, add the bot to the group and check the logs.

**Group behavior**: In groups, the bot only responds when **@mentioned** or **replied to**. This prevents the bot from reacting to every message. In DMs, it always responds.

## Claude API Provider

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `ANTHROPIC_API_KEY` | string | — | When `PROVIDER=claude-api` | Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |

## Gemini API Provider

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `GEMINI_API_KEY` | string | — | When `PROVIDER=gemini-api` | Google AI API key from [AI Studio](https://aistudio.google.com/) |

Supports native tool use (function calling). Model aliases: `flash` (gemini-2.5-flash), `pro` (gemini-2.5-pro), `flash-lite` (gemini-2.5-flash-lite). You can also pass full model IDs directly (e.g. `gemini-3-pro-preview`).

## Gemini CLI Provider

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `GEMINI_API_KEY` | string | — | No | Google AI API key. Optional — Gemini CLI also supports Google Login (OAuth) for authentication. |

The Gemini CLI must be installed globally: `npm install -g @google/gemini-cli`. Model aliases: `flash` (gemini-2.5-flash), `pro` (gemini-2.5-pro), `flash-lite` (gemini-2.5-flash-lite).

## Session

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SESSION_HISTORY_LIMIT` | integer | `20` | No | Number of recent messages to load from session history per request. Lower values reduce context size and cost; higher values give more conversational continuity. |

## Memory

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `MEMORY_DAYS` | integer | `3` | No | Number of recent daily log files to include in context |
| `MEMORY_RETENTION_DAYS` | integer | `30` | No | Days before daily logs are compacted into MEMORY.md (range: 1-365) |

The bot supports two memory tiers:
- **Global memory** (`<memory>` tags): stored in `data/memory/`, shared across all chats.
- **Per-chat memory** (`<chat-memory>` tags): stored in `data/memory/chats/{sessionId}/`, scoped to a specific conversation.

Per-chat memory is zero-config — directories are auto-created when the bot first writes a `<chat-memory>` tag. You can also manually create a `data/memory/chats/{sessionId}/MEMORY.md` for curated per-chat facts.

## Skills

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `SKILLS_DIR` | string | `~/.kenobot/config/skills` | No | Directory to scan for skill plugins |

## Tools

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `MAX_TOOL_ITERATIONS` | integer | `20` | No | Maximum tool execution rounds per message (safety valve) |

## Dev Mode

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `PROJECTS_DIR` | string | — | No | Parent directory containing project folders. When set, enables the `/dev` tool for running Claude Code in project directories with full repo context. See [Tools](features/tools.md#dev). |

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

## Config Backup (Git Sync)

When `CONFIG_REPO` is set, KenoBot automatically commits and pushes config changes (identities, skills, memory) to a private git repository. Changes are debounced — multiple writes within 30 seconds are batched into a single commit. Sync failures are logged but never crash the bot.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `CONFIG_REPO` | string | — | No | Git remote URL for config backup (e.g. `git@github.com:user/kenobot-config.git`). When empty, config sync is disabled. |

Setup:
```bash
# 1. Create a private repo on GitHub (or similar)
# 2. Set the env var
CONFIG_REPO=git@github.com:youruser/kenobot-config.git

# 3. Ensure SSH key is available (uses KENOBOT_SSH_KEY or ~/.ssh/kenobot_ed25519)
```

Synced files include identities, skills, and memory. Runtime data (sessions, logs, scheduler) and secrets (`.env` files) are excluded via `.gitignore`.

## Environment Variable: KENOBOT_HOME

The `KENOBOT_HOME` environment variable overrides the default user home directory (`~/.kenobot`). Useful for isolated development or testing:

```bash
KENOBOT_HOME=/tmp/kenobot-test kenobot start
```

## Example `.env`

```bash
# Required
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_ALLOWED_USERS=123456789

# Provider (pick one)
PROVIDER=claude-api
MODEL=sonnet
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional (defaults shown)
# IDENTITY_FILE=identities/kenobot
# SESSION_HISTORY_LIMIT=20
# MEMORY_DAYS=3
# MEMORY_RETENTION_DAYS=30
# MAX_TOOL_ITERATIONS=20

# n8n (optional)
# N8N_WEBHOOK_BASE=https://n8n.example.com/webhook

# HTTP channel (optional)
# HTTP_ENABLED=true
# HTTP_PORT=3000
# HTTP_HOST=127.0.0.1
# WEBHOOK_SECRET=your-secret-here
# HTTP_TIMEOUT=60000

# Config backup (optional)
# CONFIG_REPO=git@github.com:youruser/kenobot-config.git
```

## Multi-Instance

Each instance uses its own `.env` file. Variables are isolated per process:

```bash
# ~/.kenobot/config/main.env
PROVIDER=claude-api
MODEL=opus
IDENTITY_FILE=identities/kenobot
TELEGRAM_BOT_TOKEN=<main_bot_token>
TELEGRAM_ALLOWED_USERS=123456789
DATA_DIR=~/.kenobot/data/main

# ~/.kenobot/config/quick.env
PROVIDER=claude-api
MODEL=haiku
IDENTITY_FILE=identities/quick.md
TELEGRAM_BOT_TOKEN=<quick_bot_token>
TELEGRAM_ALLOWED_USERS=123456789
DATA_DIR=~/.kenobot/data/quick
```

Run both:
```bash
kenobot start --config ~/.kenobot/config/main.env &
kenobot start --config ~/.kenobot/config/quick.env &
```

Each instance maintains separate sessions, memory, logs, and scheduled tasks under its own `DATA_DIR`.
