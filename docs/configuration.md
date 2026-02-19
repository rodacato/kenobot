# Configuration Reference

All configuration is via environment variables. The config file lives at `~/.kenobot/config/.env` (when installed) or `.env` at the project root (when running from a git clone).

> **Canonical reference**: `templates/env.example` is always up-to-date with every variable and its default. This document adds grouping and context.

```bash
kenobot config edit                        # Edit ~/.kenobot/config/.env
kenobot config                             # Show current config (secrets redacted)
kenobot start --config config/main.env     # Use alternate config file
```

## Core

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `PROVIDER` | string | `claude-cli` | No | LLM provider: `claude-api`, `claude-cli`, `gemini-api`, `gemini-cli`, `cerebras-api`, `codex-cli`, or `mock` |
| `MODEL` | string | `sonnet` | No | Model name passed to provider: `sonnet`, `opus`, `haiku` (or full model ID) |
| `DATA_DIR` | string | `./data` | No | Base directory for sessions, logs, tasks, and scheduler data |
| `MEMORY_DIR` | string | `~/.kenobot/memory` | No | Memory directory (MEMORY.md, daily logs, working/, chats/, identity/). Override only if you need a custom location |
| `LOG_LEVEL` | string | `info` | No | Log level: `debug`, `info`, `warn`, `error` |

## Telegram

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | string | — | **Yes** | Bot token from [@BotFather](https://t.me/botfather) |
| `TELEGRAM_ALLOWED_USERS` | string | — | One of these | Comma-separated Telegram user IDs. These users can talk to the bot in any chat (DM or group). |
| `TELEGRAM_ALLOWED_CHAT_IDS` | string | — | One of these | Comma-separated Telegram chat IDs. Anyone in these chats can talk to the bot. |
| `TELEGRAM_DEBOUNCE_MS` | integer | `5000` | No | Debounce rapid consecutive messages into a single prompt (ms). Range: 0–30000 |

At least one of `TELEGRAM_ALLOWED_USERS` or `TELEGRAM_ALLOWED_CHAT_IDS` must be set.

Get your user ID from [@userinfobot](https://t.me/userinfobot). For group chat IDs, add the bot to the group and check the logs.

**Group behavior**: In groups, the bot only responds when **@mentioned** or **replied to**. This prevents the bot from reacting to every message. In DMs, it always responds.

## Provider API Keys

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `ANTHROPIC_API_KEY` | string | When `PROVIDER=claude-api` | Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys). Also accepts OAuth tokens from `claude setup-token` |
| `GEMINI_API_KEY` | string | When `PROVIDER=gemini-api` or for consciousness/embeddings | Google AI key from [AI Studio](https://aistudio.google.com/) |
| `CEREBRAS_API_KEY` | string | When `PROVIDER=cerebras-api` | Cerebras API key from [cloud.cerebras.ai](https://cloud.cerebras.ai) |

**Gemini model aliases**: `flash` (gemini-2.5-flash), `pro` (gemini-2.5-pro), `flash-lite` (gemini-2.5-flash-lite). Full model IDs also accepted.

**Gemini CLI**: Install globally with `npm install -g @google/gemini-cli`. Also supports Google Login (OAuth) — `GEMINI_API_KEY` is optional.

## Memory

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MEMORY_DAYS` | integer | `3` | Number of recent daily log files to include in context (range: 0–30) |
| `MEMORY_RETENTION_DAYS` | integer | `30` | Days before daily logs are compacted into MEMORY.md (range: 1–365) |
| `WORKING_MEMORY_STALE_DAYS` | integer | `7` | Days before working memory for a session is considered stale (range: 1–30) |

Memory is stored in `~/.kenobot/memory/`:
- **Global memory** (`<memory>` tags): shared across all chats
- **Per-chat memory** (`<chat-memory>` tags): stored in `memory/chats/{sessionId}/`, scoped to a specific conversation
- **Working memory** (`<working-memory>` tags): stored in `memory/working/{sessionId}.json`, temporary state per session

Per-chat memory is zero-config — directories are auto-created when the bot first writes a `<chat-memory>` tag.

## Session & Agent Loop

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SESSION_HISTORY_LIMIT` | integer | `20` | Number of recent messages to load from session history per request |
| `MAX_TOOL_ITERATIONS` | integer | `15` | Maximum inline tool execution rounds per message (range: 1–20) |

## Consciousness (Secondary LLM)

The Consciousness Gateway uses a fast secondary LLM for real-time evaluations: keyword expansion, confidence scoring, error classification, response quality assessment.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CONSCIOUSNESS_ENABLED` | boolean | `true` | Set to `false` to disable all consciousness evaluations (callers fall back to heuristics) |
| `CONSCIOUSNESS_PROVIDER` | string | `gemini-cli` | Provider for one-shot consciousness calls: `gemini-cli`, `gemini-api`, `cerebras-api` |
| `CONSCIOUSNESS_MODEL` | string | `gemini-2.0-flash` | Model for consciousness evaluations |
| `CONSCIOUSNESS_TIMEOUT` | integer | `30000` | Timeout per evaluation call (ms, range: 5000–120000) |

## Consolidation (Sleep Cycle LLM)

Memory consolidation during the nightly sleep cycle can use a separate, heavier model. Defaults to the consciousness provider if not set.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CONSOLIDATION_PROVIDER` | string | `CONSCIOUSNESS_PROVIDER` | Provider for consolidation tasks |
| `CONSOLIDATION_MODEL` | string | `CONSCIOUSNESS_MODEL` | Model for consolidation |
| `CONSOLIDATION_TIMEOUT` | integer | `60000` | Timeout per consolidation call (ms, range: 5000–300000) |

## Embeddings (Semantic Search)

Local vector storage for semantic memory retrieval. Disabled by default to avoid mandatory API key dependencies.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EMBEDDING_ENABLED` | boolean | `false` | Set to `true` to enable vector embeddings |
| `EMBEDDING_PROVIDER` | string | `gemini-embedding` | Embedding provider |
| `EMBEDDING_MODEL` | string | `gemini-embedding-001` | Embedding model |
| `EMBEDDING_BACKEND` | string | `jsonl` | Storage backend: `jsonl` or `sqlite` |
| `EMBEDDING_DIMENSIONS` | integer | `768` | Vector dimensions (range: 128–3072) |

## Motor System (Tools & Tasks)

The Motor System provides tool use (search, fetch, file ops, shell commands, GitHub) and background task execution.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `GITHUB_USERNAME` | string | — | GitHub username for git operations and self-improvement PRs |
| `MOTOR_SELF_REPO` | string | — | Bot's own repo for self-improvement (format: `owner/repo`) |
| `MOTOR_WORKSPACES_DIR` | string | `./data/motor/workspaces` | Directory where GitHub workspaces are cloned |
| `MOTOR_SHELL_TIMEOUT` | integer | `60000` | Shell command timeout (ms, range: 5000–300000) |
| `MOTOR_SHELL_MAX_OUTPUT` | integer | `102400` | Max shell output size in bytes (range: 1024+) |
| `MAX_TASK_ITERATIONS` | integer | `30` | Max ReAct iterations for background tasks (range: 1–50) |
| `MAX_CONCURRENT_TASKS` | integer | `1` | Max concurrent background tasks (range: 1–5) |

## Scheduler

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_SCHEDULER` | boolean | `true` | Set to `false` to disable all cron tasks |
| `TIMEZONE` | string | — | Timezone for cron jobs (IANA format, e.g. `America/Mexico_City`) |

## HTTP Webhook Channel

The HTTP channel is opt-in. When enabled, it starts a server with `POST /webhook` (HMAC-SHA256 validated) and `GET /health`.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `HTTP_ENABLED` | boolean | `false` | Set to `true` to start the HTTP server |
| `HTTP_PORT` | integer | `3000` | Port for the HTTP server |
| `HTTP_HOST` | string | `127.0.0.1` | Bind address. Keep as `127.0.0.1`; use a reverse proxy for external access |
| `WEBHOOK_SECRET` | string | — | **Required when HTTP_ENABLED**. HMAC secret. Generate: `openssl rand -hex 32` |
| `HTTP_TIMEOUT` | integer | `60000` | Timeout for webhook responses (ms) |

## REST API

The REST API mounts on the same HTTP server (requires `HTTP_ENABLED=true`). Provides 20 endpoints for conversations, memory, scheduler, sleep cycle, and tasks.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `API_ENABLED` | boolean | `false` | Set to `true` to enable the REST API |
| `API_KEY` | string | — | **Required when API_ENABLED**. Bearer token (format: `kb-{64 hex}`). Auto-generated by `kenobot setup` |
| `API_CORS_ORIGIN` | string | `*` | CORS `Access-Control-Allow-Origin` header |
| `API_TIMEOUT` | integer | `120000` | Timeout for API message responses (ms) |
| `API_RATE_LIMIT` | integer | `60` | Max requests per minute per IP (range: 1–600) |

## Resilience

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WATCHDOG_INTERVAL` | integer | `60000` | Health check interval (ms) |
| `CIRCUIT_BREAKER_THRESHOLD` | integer | `5` | Provider failures before circuit opens |
| `CIRCUIT_BREAKER_COOLDOWN` | integer | `60000` | Cooldown before retry after circuit opens (ms) |

## Example `.env`

See `templates/env.example` for a complete example with all variables and descriptions.

```bash
# Required
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_ALLOWED_USERS=123456789

# Provider (pick one)
PROVIDER=claude-cli
MODEL=sonnet

# Optional tuning
# TELEGRAM_DEBOUNCE_MS=5000
# MEMORY_DAYS=3
# SESSION_HISTORY_LIMIT=20
# CONSCIOUSNESS_PROVIDER=gemini-cli
```
