# KenoBot

Personal AI assistant powered by Claude, built for a single user, extensible by design.

Telegram bot with memory, identity, and scheduling — all running on a $4/month VPS.

## Features

- **Telegram bot** with deny-by-default authentication
- **5 LLM providers**: Claude API, Claude CLI, Gemini API, Gemini CLI, Mock (testing)
- **Nervous System**: signal-aware event bus with middleware pipeline, trace correlation, and JSONL audit trail
- **Cognitive System**: orchestrates memory, identity, and retrieval
  - **4-tier memory**: working, episodic, semantic, procedural — with auto-extraction from `<memory>`, `<chat-memory>`, `<working-memory>` tags
  - **Identity system**: modular personality (core.md + rules.json + preferences.md), conversational bootstrap, user preference learning
  - **Retrieval engine**: keyword matching + confidence scoring for selective memory recall
  - **Consolidation**: sleep cycles, memory pruning, error analysis
- **Per-chat sessions**: isolated conversation history in append-only JSONL files
- **Circuit breaker**: automatic failure protection
- **Watchdog**: health monitoring with configurable intervals
- **Cron scheduler**: persistent tasks that fire as synthetic signals
- **HTTP webhook channel**: HMAC-SHA256 validated endpoint for external integrations
- **Structured logging**: JSONL logs with daily rotation
- **Health checks**: PID management, `kenobot status`, systemd integration
- **Markdown formatter**: converts responses to Telegram HTML with 4000-char chunking

## Quick Start

### Fresh VPS (one-liner)

For a new Ubuntu/Debian server — installs kenobot and Cloudflare tunnel:

```bash
curl -sSL https://raw.githubusercontent.com/rodacato/kenobot/master/install.sh | sudo bash
```

### Manual Install

Prerequisites: Node.js 22+, a [Telegram bot token](https://t.me/botfather), your [chat ID](https://t.me/userinfobot).

```bash
npm install -g github:rodacato/kenobot
kenobot setup                 # Scaffold ~/.kenobot/ directories
kenobot config edit          # Set TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USERS, PROVIDER
kenobot start                # Start the bot
```

### CLI Commands

```bash
kenobot setup                # Scaffold ~/.kenobot/ directories
kenobot start [-d]           # Start (foreground, or -d for daemon)
kenobot stop                 # Stop daemon
kenobot restart              # Restart daemon
kenobot status               # Check if running
kenobot logs                 # Tail latest log
kenobot config [edit]        # Show config or open in $EDITOR
kenobot dev                  # Run with --watch (development mode)
kenobot reset                # Reset cognitive system
kenobot doctor               # Diagnose common problems
kenobot update               # Update to latest release
kenobot version              # Show version
```

### Development

```bash
git clone https://github.com/rodacato/kenobot.git
cd kenobot
npm install && npm link      # Makes 'kenobot' available globally (symlink)
kenobot setup                 # Scaffold ~/.kenobot/
kenobot config edit          # Set tokens and provider
kenobot start                # Run the bot
```

See [Getting Started](docs/getting-started.md) for a detailed walkthrough or [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

## Architecture

Event-driven architecture with two bounded contexts: the **Nervous System** (signaling) and the **Cognitive System** (memory & identity).

```
User → Telegram → TelegramChannel → bus.fire('message:in') → AgentLoop → ContextBuilder → Provider.chat()
                                                                  ↓
User ← Telegram ← TelegramChannel ← bus.fire('message:out') ← AgentLoop (memory extraction → session save)
```

All components communicate via the Nervous System — a signal-aware event bus with middleware, tracing, and audit. Channels and providers are pluggable — swap or extend without touching the core.

**Signals**: `message:in`, `message:out`, `thinking:start`, `error`, `notification`, `config:changed`, `health:degraded`, `health:unhealthy`, `health:recovered`, `approval:proposed`, `approval:approved`, `approval:rejected`

See [Architecture](docs/architecture.md) for a deep dive.

## Configuration

All configuration via environment variables. The config file lives at `~/.kenobot/config/.env`.

Use `kenobot config edit` to open it, or pass `--config path/to/file.env` when running directly.

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | *required* | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_USERS` | *required* | Comma-separated allowed user IDs |
| `TELEGRAM_ALLOWED_CHAT_IDS` | — | Comma-separated allowed group chat IDs |
| `PROVIDER` | `claude-cli` | `claude-api`, `claude-cli`, `gemini-api`, `gemini-cli`, or `mock` |
| `MODEL` | `sonnet` | `sonnet`, `opus`, or `haiku` |
| `ANTHROPIC_API_KEY` | — | Required for `claude-api` provider |
| `GOOGLE_API_KEY` | — | Required for `gemini-api` provider |
| `DATA_DIR` | `./data` | Where sessions, memory, and logs are stored |
| `MEMORY_DAYS` | `3` | Days of recent notes to include in context |
| `MEMORY_RETENTION_DAYS` | `30` | Days before memories are pruned |
| `WORKING_MEMORY_STALE_DAYS` | `7` | Days before working memory entries go stale |
| `SESSION_HISTORY_LIMIT` | `20` | Max messages per session in context |
| `ENABLE_SCHEDULER` | `true` | Set to `false` to disable cron tasks |
| `TIMEZONE` | — | IANA timezone for cron (e.g. `America/Mexico_City`) |
| `WATCHDOG_INTERVAL` | `60000` | Health monitoring interval (ms) |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before circuit opens |
| `CIRCUIT_BREAKER_COOLDOWN` | `60000` | Cooldown before circuit closes (ms) |
| `HTTP_ENABLED` | `false` | Enable HTTP webhook channel |
| `HTTP_PORT` | `3000` | HTTP server port |
| `HTTP_HOST` | `127.0.0.1` | HTTP server bind address |
| `WEBHOOK_SECRET` | — | HMAC secret for webhook validation |
| `HTTP_TIMEOUT` | `60000` | Webhook response timeout (ms) |

See [Configuration](docs/configuration.md) for details.

## Providers

| Provider | When to Use | Speed | Cost |
|----------|------------|-------|------|
| `claude-api` | Production, fastest responses | ~3s | Per-token (Anthropic billing) |
| `claude-cli` | Using existing Claude CLI subscription | ~20s | CLI subscription |
| `gemini-api` | Google AI alternative, production | ~3s | Per-token (Google billing) |
| `gemini-cli` | Using existing Gemini CLI | ~15s | CLI subscription |
| `mock` | Testing, development | Instant | Free |

Switch providers by changing `PROVIDER` in `.env`. The agent loop doesn't know or care which provider it's using. Circuit breaker protects against provider failures.

## Project Structure

```
kenobot/                       # Engine (framework code, updatable)
  src/
    cli.js                     # CLI entry point (kenobot command)
    app.js                     # Composition root factory: { bus, agent, channels, cognitive, start(), stop() }
    index.js                   # Bot entry point, signals, provider registration
    config.js                  # Env-based config with --config flag
    paths.js                   # Path resolution (~/.kenobot/)
    logger.js                  # Structured JSONL logger
    health.js                  # PID management + health status
    watchdog.js                # Health monitoring
    notifications.js           # Notification routing
    events.js                  # Signal type constants
    bus.js                     # Legacy MessageBus (backward compat)
    cli/                       # CLI subcommands
      setup.js                 # Scaffold ~/.kenobot/ directories
      start.js                 # Start bot (foreground or daemon)
      stop.js                  # Stop daemon
      restart.js               # Restart daemon
      status.js                # Health check + uptime
      logs.js                  # Tail log files
      dev.js                   # Run with --watch
      config-cmd.js            # Show/edit config
      reset.js                 # Reset cognitive system
      doctor.js                # Diagnose common problems
      update.js                # Update to latest release
      version.js               # Show version
      help.js                  # Usage help
      utils.js                 # Shared CLI helpers
    nervous/                   # Nervous System (bounded context)
      index.js                 # NervousSystem facade (signal-aware bus)
      signal.js                # Signal class (typed envelope)
      signals.js               # Signal type constants
      middleware.js             # Built-in middleware (trace, logging, dead-signal)
      audit-trail.js           # JSONL signal persistence
    cognitive/                 # Cognitive System (bounded context)
      index.js                 # CognitiveSystem facade
      memory/                  # 4-tier memory
        memory-system.js       # Memory orchestrator
        working-memory.js      # Short-term context
        episodic-memory.js     # Conversation episodes
        semantic-memory.js     # Factual knowledge
        procedural-memory.js   # Learned patterns
      identity/                # Identity system
        identity-manager.js    # Identity orchestrator
        core-loader.js         # Load core.md + rules.json + preferences.md
        bootstrap-orchestrator.js  # First-conversation onboarding
        preferences-manager.js # User preference learning
        profile-inferrer.js    # Infer user profile from context
        rules-engine.js        # Identity rules evaluation
      retrieval/               # Selective memory recall
        retrieval-engine.js    # Retrieval orchestrator
        keyword-matcher.js     # Keyword-based matching
        confidence-scorer.js   # Relevance scoring
      consolidation/           # Memory maintenance
        consolidator.js        # Consolidation orchestrator
        sleep-cycle.js         # Periodic consolidation
        memory-pruner.js       # Prune old/irrelevant memories
        error-analyzer.js      # Analyze errors for patterns
      utils/                   # Cognitive utilities
        cost-tracker.js        # Token/cost tracking
        memory-health.js       # Memory health checks
        message-batcher.js     # Batch message processing
        transparency.js        # Transparency reporting
    agent/
      loop.js                  # Core: message:in → context → provider → memory → message:out
      context.js               # Prompt assembly: identity + memory + history
      post-processors.js       # Response processing pipeline
      typing-indicator.js      # Typing indicator middleware
      memory-extractor.js      # Extracts <memory> tags
      chat-memory-extractor.js # Extracts <chat-memory> tags
      working-memory-extractor.js  # Extracts <working-memory> tags
      user-extractor.js        # Extracts <user> tags for preferences
      bootstrap-extractor.js   # Detects <bootstrap-complete/>
    channels/
      base.js                  # BaseChannel: template method, deny-by-default auth
      telegram.js              # Grammy integration, HTML formatting, chunking
      http.js                  # Webhook endpoint with HMAC validation + /health
    providers/
      base.js                  # BaseProvider: chat(messages, options) interface
      registry.js              # Self-registration pattern
      circuit-breaker.js       # Failure protection with fallback
      claude-api.js            # Anthropic SDK
      claude-cli.js            # Claude CLI subprocess
      gemini-api.js            # Google GenAI SDK
      gemini-cli.js            # Gemini CLI subprocess
      mock.js                  # Scriptable test provider
    storage/
      base.js                  # BaseStorage interface
      filesystem.js            # Append-only JSONL sessions + markdown memory
      memory-store.js          # Memory persistence layer
    scheduler/
      scheduler.js             # Cron jobs with persistence
    format/
      telegram.js              # Markdown-to-Telegram HTML converter
    utils/
      safe-path.js             # Path traversal protection
  templates/                   # Default files copied by kenobot setup
    env.example                # Config template
    identity/                  # Default bot identity (core.md, rules.json, BOOTSTRAP.md)
    memory/MEMORY.md           # Starter memory file
    HEARTBEAT.md               # Dev session continuity template
    AGENTS.md                  # Workspace template
  bin/                         # Dev/ops scripts
  docs/                        # Documentation
  test/                        # Test suite (mirrors src/ structure)

~/.kenobot/                    # User home (persistent across updates)
  config/
    .env                       # Bot configuration
  data/
    sessions/                  # Per-chat JSONL history
    memory/                    # Cognitive system memory store
      identity/                # Bot identity (core.md, rules.json, preferences.md)
    logs/                      # Structured JSONL logs
    scheduler/                 # Persistent task definitions
```

## Documentation

- [Getting Started](docs/getting-started.md) — Step-by-step first-time setup
- [Architecture](docs/architecture.md) — How the system works internally
- [Configuration](docs/configuration.md) — Complete environment variable reference
- [Events](docs/events.md) — Signal schema and contracts
- [Memory System](docs/memory.md) — Four-tier memory architecture
- [Identity System](docs/identity.md) — Modular identity, bootstrap, preferences
- [Security](SECURITY.md) — Security model, best practices, deployment checklist

## Tech Stack

- **Runtime**: Node.js 22+, pure ESM, no build step
- **Runtime deps**: grammy, dotenv, @anthropic-ai/sdk, @google/genai, node-cron
- **Testing**: Vitest 4.x
- **Style**: `.editorconfig` (2-space indent, UTF-8, LF)

## Contributing

Contributions are welcome! We organize contribution opportunities by **impact level** to help you find the right starting point.

### 🟢 Low-Risk Contributions (Great First Issues)

**Documentation** - Improve clarity, fix typos, add examples:
- Guides and references ([docs/](docs/))
- Code comments and JSDoc

**Tests** - Increase coverage, improve reliability:
- Unit tests for providers, cognitive system, utilities
- Integration tests for message flows
- E2E tests for real-world scenarios

**Examples** - Help new users get started:
- Identity templates
- Configuration examples for common setups

### 🟡 Medium-Risk Contributions (Familiar with Codebase)

**Providers** - Add LLM support:
- New providers (Ollama, OpenAI)
- Provider improvements (streaming, embeddings)
- Contract tests for consistency

**Channels** - Connect to more platforms:
- New channels (Discord, Slack, WhatsApp)
- Channel improvements (media support, formatting)
- Authentication patterns

### 🔴 High-Risk Contributions (Core Maintainers)

**Core Components** - Requires deep understanding:
- Agent loop (`src/agent/loop.js`)
- Nervous System (`src/nervous/`)
- Cognitive System (`src/cognitive/`)
- Context builder (`src/agent/context.js`)
- Storage layer (`src/storage/`)

**IMPORTANT:** Changes to core components require:
- Architecture discussion first (open an issue)
- 100% test coverage for new code
- Integration tests demonstrating correctness
- Approval from maintainers

### Current Focus Areas

We're actively looking for help with:

1. **📝 Documentation** - Improving docs clarity and completeness
2. **🧪 Testing** - Reaching 90% code coverage
3. **🤖 Providers** - Adding Ollama, OpenAI support
4. **🧠 Cognitive System** - Improving memory consolidation and retrieval

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit conventions, testing guidelines, and branching strategy.

## Acknowledgments

KenoBot's architecture draws inspiration from:

- [Claudio](https://github.com/edgarjs/claudio) — CLI wrapping pattern, context injection via prompt
- [Nanobot](https://github.com/HKUDS/nanobot) — Message bus architecture, template method channels, markdown memory
- [OpenClaw](https://github.com/openclaw/openclaw) — JSONL sessions, on-demand skill loading, context management

## License

[MIT](LICENSE)
