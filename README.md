# KenoBot

Personal AI assistant powered by Claude, with a Star Wars personality.

## Status

**Phase 2 (Memory System) complete** — Agent loop, context building, session persistence, and memory extraction all working.

### What's Working

- Telegram bot with deny-by-default authentication
- Event-driven message bus (EventEmitter)
- Agent loop with per-chat session routing
- Context builder: identity injection + conversation history (last 20 messages)
- Memory system: daily logs + curated MEMORY.md + auto-extraction from responses
- 3 interchangeable providers: `mock`, `claude-cli`, `claude-api`
- Markdown-to-HTML formatter for Telegram (4000 char chunking)
- Append-only JSONL session persistence (`data/sessions/`)
- Structured JSONL logging (`data/logs/`)
- Vitest test suite with 54% coverage

### What's Next

Phase 3+ (see [docs/PLAN.md](docs/PLAN.md)): n8n integration, tools, skills, scheduling, hardening.

## Quick Start

### Prerequisites

- Node.js 22+
- Telegram bot token from [@BotFather](https://t.me/botfather)
- Your chat ID from [@userinfobot](https://t.me/userinfobot)
- (Optional) [Anthropic API key](https://console.anthropic.com/settings/keys) for `claude-api` provider
- (Optional) [Claude Code CLI](https://claude.ai/download) for `claude-cli` provider

### Setup

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for a detailed step-by-step guide.

### Run

```bash
npm start          # Start the bot
npm run dev        # Start with --watch for auto-reload
npm test           # Run tests
npm run test:coverage  # Coverage report
```

## Architecture

```
Telegram → TelegramChannel → bus 'message:in' → AgentLoop → ContextBuilder → Provider.chat()
                                                    ↓
Telegram ← TelegramChannel ← bus 'message:out' ← AgentLoop (saves session, extracts memory)
```

**Bus events**: `message:in`, `message:out`, `thinking:start`, `error`

**Key modules**:

| Module | Purpose |
|--------|---------|
| [src/index.js](src/index.js) | Entry point, wires components |
| [src/bus.js](src/bus.js) | Singleton EventEmitter message bus |
| [src/agent/loop.js](src/agent/loop.js) | AgentLoop: message:in → provider → message:out |
| [src/agent/context.js](src/agent/context.js) | ContextBuilder: identity + memory + session history |
| [src/agent/memory.js](src/agent/memory.js) | MemoryManager: daily logs + MEMORY.md |
| [src/agent/memory-extractor.js](src/agent/memory-extractor.js) | Extracts `<memory>` tags from responses |
| [src/channels/telegram.js](src/channels/telegram.js) | grammy integration, HTML formatting, chunking |
| [src/providers/claude-api.js](src/providers/claude-api.js) | Anthropic SDK direct |
| [src/providers/claude-cli.js](src/providers/claude-cli.js) | Claude CLI subprocess wrapper |
| [src/providers/mock.js](src/providers/mock.js) | Deterministic test provider |
| [src/storage/filesystem.js](src/storage/filesystem.js) | Append-only JSONL session files |
| [src/config.js](src/config.js) | Env-based config, supports `--config` flag |
| [src/logger.js](src/logger.js) | Structured JSONL logger |

## Configuration

See [.env.example](.env.example) for all options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Yes | Comma-separated allowed chat IDs |
| `PROVIDER` | No | `mock` (default), `claude-cli`, or `claude-api` |
| `MODEL` | No | `sonnet` (default), `opus`, or `haiku` |
| `ANTHROPIC_API_KEY` | For claude-api | Anthropic API key |
| `IDENTITY_FILE` | No | Path to identity file (default: `identities/kenobot.md`) |
| `DATA_DIR` | No | Data directory (default: `./data`) |

### Multi-instance

Run multiple bot instances with different configs:

```bash
node src/index.js --config config/main.env
node src/index.js --config config/designer.env
```

## Tech Stack

- **Runtime**: Node.js 22+, pure ESM, no build step
- **Dependencies**: grammy, dotenv, @anthropic-ai/sdk
- **Testing**: Vitest 4.x
- **Style**: `.editorconfig` (2-space indent, UTF-8, LF), no TypeScript, no ESLint

## Project Structure

```
kenobot/
  src/
    index.js               # Entry point
    bus.js                  # EventEmitter message bus
    config.js               # Env-based configuration
    logger.js               # Structured JSONL logger
    agent/
      loop.js               # Core reasoning loop
      context.js            # Prompt assembly (identity + memory + history)
      memory.js             # Memory manager (daily logs + MEMORY.md)
      memory-extractor.js   # Extract <memory> tags from responses
    channels/
      base.js               # Channel interface (deny-by-default auth)
      telegram.js           # Telegram adapter (grammy)
    providers/
      base.js               # Provider interface
      claude-api.js          # Anthropic SDK
      claude-cli.js          # Claude CLI wrapper
      mock.js               # Test provider
    storage/
      base.js               # Storage interface
      filesystem.js         # JSONL session files
    format/
      telegram.js           # Markdown → Telegram HTML
  test/                     # Mirrors src/ structure
  identities/
    kenobot.md              # Bot personality (system prompt)
  data/                     # Runtime data (gitignored)
    sessions/               # Per-chat JSONL files
    memory/                 # Daily logs + MEMORY.md
    logs/                   # Structured JSONL logs
  docs/
    PLAN.md                 # Full roadmap with patterns and phases
    research/               # Analysis of related projects
  config/                   # Alternate .env files for multi-instance
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Conventional commits enforced via git hooks. Linear history (rebase, not merge).

## License

MIT
