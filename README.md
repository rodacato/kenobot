# KenoBot

Your own AI assistant on Telegram — with memory, personality, and a $4/month server bill.

A single-user bot that remembers your conversations, learns your preferences, and runs 24/7 on a cheap VPS. Powered by Claude, Gemini, or any LLM you plug in.

## What can it do?

**It remembers**

> **You**: "My exam is on Friday"
>
> *...three days later...*
>
> **KenoBot**: "How did the exam go?"

**It has personality**

> **You**: "Should I use microservices for this project?"
>
> **KenoBot**: "On a 4GB VPS? That's a monolith with extra network hops. Keep it simple."

**It schedules**

> **You**: "Remind me to check deploy logs every Monday at 9am"
>
> **KenoBot**: "Done. I'll ping you Mondays at 9:00 America/Mexico_City."

Under the hood: a 4-tier memory system (working, episodic, semantic, procedural), a customizable identity with preference learning, a nightly sleep cycle that consolidates what it learned, and 5 swappable LLM providers. Single Node.js process, 4 runtime dependencies, no build step.

## Quickstart

Prerequisites: Node.js 22+, a [Telegram bot token](https://t.me/botfather), your [chat ID](https://t.me/userinfobot).

```bash
# 1. Install
npm install -g github:rodacato/kenobot
kenobot setup

# 2. Configure
kenobot config edit
```

Set the minimum in your `.env`:

```bash
TELEGRAM_BOT_TOKEN=your-token-from-botfather
TELEGRAM_ALLOWED_USERS=your-telegram-id
PROVIDER=claude-api
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
# 3. Run
kenobot start
```

Open Telegram, find your bot, say hello.

> **Deploying to a VPS?** See the full [Getting Started guide](docs/getting-started.md) — covers BotFather walkthrough, VPS deployment, systemd, and Cloudflare tunnel.

### From Source

```bash
git clone https://github.com/rodacato/kenobot.git
cd kenobot && npm install && npm link
kenobot setup && kenobot config edit
kenobot start
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow.

## How it works

```
You (Telegram) → Channel → Nervous System (signal bus) → Agent Loop
                                                              │
                                                      Context Builder
                                                    (identity + memory)
                                                              │
                                                        LLM Provider
                                                   (Claude / Gemini / Mock)
                                                              │
                                                      Memory extraction
                                                    (save what it learned)
                                                              │
You (Telegram) ← Channel ← Nervous System ←───────────── Response
```

- **Nervous System** — Event bus with middleware, tracing, and audit trail. All components communicate through signals.
- **Cognitive System** — 4-tier memory, identity, retrieval, metacognition, and a nightly sleep cycle.
- **Providers** — Claude API, Claude CLI, Gemini API, Gemini CLI, or mock. All implement the same `chat()` interface.
- **Channels** — Telegram (primary) and HTTP webhooks. Adding a new channel is ~100 lines.

Deep dive: [Architecture](docs/architecture.md) | [Memory](docs/memory.md) | [Identity](docs/identity.md) | [Events](docs/events.md)

## Configuration

All config lives in `~/.kenobot/config/.env`. The minimum:

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | From [@BotFather](https://t.me/botfather) |
| `TELEGRAM_ALLOWED_USERS` | Yes | Your Telegram user ID |
| `PROVIDER` | No | `claude-api` (default), `gemini-api`, `claude-cli`, `gemini-cli`, `mock` |
| `ANTHROPIC_API_KEY` | For `claude-api` | From [console.anthropic.com](https://console.anthropic.com) |
| `GEMINI_API_KEY` | For `gemini-api`, `gemini-cli`, consciousness | From [AI Studio](https://aistudio.google.com) |
| `CEREBRAS_API_KEY` | For `cerebras-api` | From [cloud.cerebras.ai](https://cloud.cerebras.ai) |

20+ additional settings (memory retention, session limits, webhooks, circuit breaker, etc.): [docs/configuration.md](docs/configuration.md)

## Providers

| Provider | When to Use | Speed | Cost |
|----------|------------|-------|------|
| `claude-api` | Production, fastest responses | ~3s | Per-token (Anthropic billing) |
| `claude-cli` | Using existing Claude CLI subscription | ~20s | CLI subscription |
| `gemini-api` | Google AI alternative, production | ~3s | Per-token (Google billing) |
| `gemini-cli` | Using existing Gemini CLI | ~15s | CLI subscription |
| `cerebras-api` | Ultra-fast inference (Llama models) | <1s | Per-token (Cerebras billing) |
| `mock` | Testing, development | Instant | Free |

## CLI

```bash
kenobot setup          # First-time directory setup
kenobot start [-d]     # Start (foreground or daemon)
kenobot stop           # Stop daemon
kenobot restart        # Restart daemon
kenobot status         # Health check + uptime
kenobot logs           # View logs
kenobot config [edit]  # Show or edit configuration
kenobot doctor         # Diagnose common problems
kenobot reset          # Reset cognitive system
kenobot update         # Update to latest version
kenobot dev            # Run with --watch (development)
```

## Documentation

- [Getting Started](docs/getting-started.md) — Step-by-step setup (local + VPS)
- [Architecture](docs/architecture.md) — System internals and project structure
- [Configuration](docs/configuration.md) — Complete environment variable reference
- [Events](docs/events.md) — Signal schema and contracts
- [Memory System](docs/memory.md) — Four-tier memory architecture
- [Identity System](docs/identity.md) — Personality, bootstrap, preferences
- [Security](SECURITY.md) — Security model and deployment checklist

## Contributing

Contributions welcome — especially docs, tests, and new providers. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, commit conventions, and testing guidelines.

## Acknowledgments

KenoBot's architecture draws inspiration from:

- [Claudio](https://github.com/edgarjs/claudio) — CLI wrapping pattern, context injection via prompt
- [Nanobot](https://github.com/HKUDS/nanobot) — Message bus architecture, template method channels, markdown memory
- [OpenClaw](https://github.com/openclaw/openclaw) — JSONL sessions, on-demand skill loading, context management

## License

[MIT](LICENSE)
