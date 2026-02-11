# KenoBot

Personal AI assistant powered by Claude, built for a single user, extensible by design.

Telegram bot with memory, tools, skills, scheduling, and n8n integration — all running on a $4/month VPS.

## Features

- **Telegram bot** with deny-by-default authentication
- **3 LLM providers**: Claude API (Anthropic SDK), Claude CLI (subprocess wrapper), Mock (testing)
- **Memory system**: daily logs + curated MEMORY.md + auto-extraction from `<memory>` tags
- **Per-chat sessions**: isolated conversation history in append-only JSONL files
- **Tool system**: registry with slash command triggers + LLM tool_use support
  - `web_fetch` — fetch and extract text from URLs (`/fetch <url>`)
  - `n8n_trigger` — trigger n8n workflows via webhook (`/n8n <workflow>`)
  - `schedule` — cron-based task scheduling (`/schedule add|list|remove`)
  - `dev` — run Claude Code in project directories (`/dev <project> <task>`)
  - `github` — git operations (`/git status|commit|push|pull|log`)
  - `pr` — GitHub Pull Requests (`/pr create|list|view|merge`)
  - `approval` — propose skills, workflows, identity changes (`/pending|approve|reject`)
- **Skill plugins**: drop-in directories with `manifest.json` + `SKILL.md`, loaded on-demand
- **n8n integration**: bidirectional webhooks (bot triggers workflows, workflows call bot)
- **Cron scheduler**: persistent tasks that survive restarts
- **HTTP webhook channel**: HMAC-SHA256 validated endpoint for external integrations
- **Structured logging**: JSONL logs with daily rotation
- **Health checks**: PID management, `kenobot status`, systemd integration
- **Multi-instance**: run multiple bots with different configs, providers, and identities
- **Markdown formatter**: converts responses to Telegram HTML with 4000-char chunking

## Quick Start

### Fresh VPS (one-liner)

For a new Ubuntu/Debian server — installs kenobot, n8n, and Cloudflare tunnel:

```bash
curl -sSL https://raw.githubusercontent.com/rodacato/kenobot/master/install.sh | sudo bash
```

### Manual Install

Prerequisites: Node.js 22+, a [Telegram bot token](https://t.me/botfather), your [chat ID](https://t.me/userinfobot).

```bash
npm install -g github:rodacato/kenobot
kenobot init                 # Scaffold ~/.kenobot/ directories
kenobot config edit          # Set TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USERS, PROVIDER
kenobot start                # Start the bot
```

### CLI Commands

```bash
kenobot start [-d]           # Start (foreground, or -d for daemon)
kenobot stop                 # Stop daemon
kenobot status               # Check if running
kenobot logs                 # Tail latest log
kenobot config [edit]        # Show config or open in $EDITOR
kenobot backup               # Backup config/ and data/
kenobot purge                # Reset runtime data (sessions, logs, scheduler)
kenobot doctor               # Diagnose common problems
kenobot update               # Update to latest release
```

### Development

```bash
git clone https://github.com/rodacato/kenobot.git
cd kenobot
npm install && npm link      # Makes 'kenobot' available globally (symlink)
kenobot init                 # Scaffold ~/.kenobot/
kenobot config edit          # Set tokens and provider
kenobot start                # Run the bot
```

See [Getting Started](docs/getting-started.md) for a detailed walkthrough or [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

## Architecture

```
User → Telegram → TelegramChannel → bus 'message:in' → AgentLoop → ContextBuilder → Provider.chat()
                                                            ↓
User ← Telegram ← TelegramChannel ← bus 'message:out' ← AgentLoop (tool loop → memory extraction → session save)
```

All components communicate via an EventEmitter message bus. Channels, providers, tools, and skills are pluggable — swap or extend without touching the core.

**Bus events**: `message:in`, `message:out`, `thinking:start`, `error`

See [Architecture](docs/architecture.md) for a deep dive.

## Configuration

All configuration via environment variables. The config file lives at `~/.kenobot/config/.env` (or `$KENOBOT_HOME/config/.env`).

Use `kenobot config edit` to open it, or pass `--config path/to/file.env` when running directly.

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | *required* | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_USERS` | *required** | Comma-separated allowed user IDs |
| `TELEGRAM_ALLOWED_CHAT_IDS` | optional | Comma-separated allowed group chat IDs |
| `PROVIDER` | `claude-cli` | `claude-api`, `claude-cli`, or `mock` |
| `MODEL` | `sonnet` | `sonnet`, `opus`, or `haiku` |
| `ANTHROPIC_API_KEY` | — | Required for `claude-api` provider |
| `IDENTITY_FILE` | `identities/kenobot` | Path to bot identity directory |
| `DATA_DIR` | `~/.kenobot/data` | Where sessions, memory, and logs are stored |
| `SKILLS_DIR` | `~/.kenobot/config/skills` | Directory for skill plugins |
| `MEMORY_DAYS` | `3` | How many days of recent notes to include in context |
| `MAX_TOOL_ITERATIONS` | `20` | Safety limit for tool execution loops |
| `N8N_WEBHOOK_BASE` | — | Base URL for n8n webhooks (enables n8n tool) |
| `HTTP_ENABLED` | `false` | Enable HTTP webhook channel |
| `HTTP_PORT` | `3000` | HTTP server port |
| `HTTP_HOST` | `127.0.0.1` | HTTP server bind address |
| `WEBHOOK_SECRET` | — | HMAC secret for webhook validation |
| `HTTP_TIMEOUT` | `60000` | Webhook response timeout (ms) |
| `PROJECTS_DIR` | — | Parent dir for `/dev` mode (enables workspace dev tool) |

See [Configuration Reference](docs/configuration.md) for details.

## Providers

| Provider | When to Use | Speed | Cost |
|----------|------------|-------|------|
| `claude-api` | Production, fastest responses | ~3s | Per-token (Anthropic billing) |
| `claude-cli` | Using existing Claude CLI subscription | ~20s | CLI subscription |
| `mock` | Testing, development | Instant | Free |

Switch providers by changing `PROVIDER` in `.env`. The agent loop doesn't know or care which provider it's using.

## Multi-Instance

Run multiple bot instances with different identities, providers, and data:

```bash
kenobot start --config config/main.env       # @kenobot_main (Claude, Opus)
kenobot start --config config/designer.env   # @kenobot_design (Gemini, Flash)
kenobot start --config config/quick.env      # @kenobot_quick (Claude, Haiku)
```

Each instance gets its own Telegram bot, identity file, data directory, and provider. Zero code changes needed.

## Project Structure

```
kenobot/                       # Engine (framework code, updatable)
  src/
    cli.js                     # CLI entry point (kenobot command)
    paths.js                   # Path resolution (~/.kenobot/ or $KENOBOT_HOME)
    index.js                   # Bot entry point, wires all components
    bus.js                     # Singleton EventEmitter message bus
    config.js                  # Env-based config with --config flag
    logger.js                  # Structured JSONL logger
    health.js                  # PID management + health status
    cli/                       # CLI subcommands
      init.js                  # Scaffold ~/.kenobot/ directories
      start.js                 # Start bot (foreground or daemon)
      stop.js                  # Stop daemon
      restart.js               # Restart daemon
      status.js                # Health check + uptime
      logs.js                  # Tail log files
      backup.js                # Data backup with rotation
      purge.js                 # Reset runtime data (3 levels)
      doctor.js                # Diagnose common problems (10 checks)
      utils.js                 # Shared CLI helpers (colors, exists, dirSize)
      config-cmd.js            # Show/edit config
      update.js                # Update to latest release tag
      migrate.js               # Migrate from old layout
      audit.js                 # Security audit wrapper
      install-service.js       # Generate systemd unit
      version.js               # Show version
      help.js                  # Usage help
    agent/
      loop.js                  # Core: message:in → context → provider → tool loop → message:out
      context.js               # Prompt assembly: identity + tools + skills + memory + history
      memory.js                # Daily logs + MEMORY.md management
      memory-extractor.js      # Extracts <memory> tags from responses
      user-extractor.js        # Extracts <user> tags for preference learning
      bootstrap-extractor.js   # Detects <bootstrap-complete/> tag
      identity.js              # Modular identity loader (SOUL + IDENTITY + USER + BOOTSTRAP)
    channels/
      base.js                  # BaseChannel: template method, deny-by-default auth
      telegram.js              # grammy integration, HTML formatting, chunking
      http.js                  # Webhook endpoint with HMAC validation + /health
    providers/
      base.js                  # BaseProvider: chat(messages, options) interface
      claude-api.js            # Anthropic SDK direct
      claude-cli.js            # Claude CLI subprocess wrapper
      mock.js                  # Deterministic test provider
    storage/
      base.js                  # BaseStorage interface
      filesystem.js            # Append-only JSONL sessions + markdown memory
    tools/
      base.js                  # BaseTool: definition + execute + optional trigger
      registry.js              # Tool registration and trigger matching
      web-fetch.js             # Fetch URLs, extract text (10KB limit)
      n8n.js                   # Trigger n8n workflows via webhook
      schedule.js              # Cron task management (add/list/remove)
      dev.js                   # Workspace development mode (/dev)
    skills/
      loader.js                # Discover skills from directory, on-demand prompt loading
    scheduler/
      scheduler.js             # Cron jobs with persistence
    format/
      telegram.js              # Markdown-to-Telegram HTML converter
  templates/                   # Default files copied by kenobot init
    env.example                # Config template
    identities/kenobot/        # Default bot identity (SOUL.md, IDENTITY.md, USER.md, BOOTSTRAP.md)
    HEARTBEAT.md               # Dev session continuity template
    skills/weather/            # Example skill
    skills/daily-summary/      # Example skill
    memory/MEMORY.md           # Starter memory file
  bin/                         # Dev/ops scripts
    release                    # Changelog generation + git tag
    audit                      # Security audit
  docs/                        # Documentation
  test/                        # Test suite (mirrors src/ structure)

~/.kenobot/                    # User home (persistent across updates)
  config/
    .env                       # Bot configuration
    identities/kenobot/        # Bot identity (SOUL.md, IDENTITY.md, USER.md)
    skills/                    # User skill plugins
  data/
    sessions/                  # Per-chat JSONL history
    memory/                    # Daily logs + MEMORY.md
    logs/                      # Structured JSONL logs
    scheduler/                 # Persistent task definitions
  backups/                     # Backup archives
```

## Documentation

- [Architecture](docs/architecture.md) — How the system works internally
- [Configuration](docs/configuration.md) — Complete environment variable reference
- [Deployment](docs/deployment.md) — VPS setup, systemd, auto-recovery, backups
- [Getting Started](docs/getting-started.md) — Step-by-step first-time setup
- [Security](SECURITY.md) — Security model, best practices, deployment checklist

### Feature Guides

- [Identity](docs/features/identity.md) — Modular identity files, bootstrap onboarding, user preference learning
- [Providers](docs/features/providers.md) — LLM provider configuration and switching
- [Channels](docs/features/channels.md) — Telegram, HTTP webhooks, adding new channels
- [Memory](docs/features/memory.md) — Daily logs, MEMORY.md, auto-extraction
- [Tools](docs/features/tools.md) — Built-in tools, slash commands, creating custom tools
- [Skills](docs/features/skills.md) — Plugin system with on-demand prompt loading
- [Scheduler](docs/features/scheduler.md) — Cron-based task scheduling
- [n8n Integration](docs/features/n8n.md) — Bidirectional webhook integration
- [Multi-Instance](docs/features/multi-instance.md) — Running multiple bots
- [Logging](docs/features/logging.md) — Structured JSONL logging
- [Health & Recovery](docs/features/health.md) — Health checks, auto-recovery, backups
- [Self-Improvement](docs/features/self-improvement.md) — How the bot improves itself over time

## Tech Stack

- **Runtime**: Node.js 22+, pure ESM, no build step
- **Runtime deps**: grammy, dotenv, @anthropic-ai/sdk, node-cron
- **Testing**: Vitest 4.x
- **Style**: `.editorconfig` (2-space indent, UTF-8, LF)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions, testing guidelines, and branching strategy.

## Acknowledgments

KenoBot's architecture draws inspiration from:

- [Claudio](https://github.com/edgarjs/claudio) — CLI wrapping pattern, context injection via prompt
- [Nanobot](https://github.com/HKUDS/nanobot) — Message bus architecture, template method channels, markdown memory
- [OpenClaw](https://github.com/openclaw/openclaw) — JSONL sessions, on-demand skill loading, context management

## License

[MIT](LICENSE)
