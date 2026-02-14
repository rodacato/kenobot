# Architecture

> Event-driven architecture with two bounded contexts: the **Nervous System** (signaling) and the **Cognitive System** (memory & identity). Every piece is swappable without touching the core.

## Overview

KenoBot follows an **event-driven architecture** where all components communicate through the Nervous System — a signal-aware event bus with middleware, tracing, and audit. No component calls another directly — they fire and listen to signals.

```
┌─────────────────────────────────────────────────────────────┐
│                       KenoBot Core                          │
│                                                             │
│  ┌────────────┐  ┌───────────┐  ┌──────────────────────┐   │
│  │  Context    │  │   Agent   │  │   Cognitive System   │   │
│  │  Builder    │  │   Loop    │  │                      │   │
│  │            │  │           │  │ working memory       │   │
│  │ identity   │  │ receive   │  │ episodic memory      │   │
│  │ memory     │  │ build     │  │ semantic memory      │   │
│  │ history    │  │ execute   │  │ procedural memory    │   │
│  └────────────┘  └─────┬─────┘  └──────────────────────┘   │
│                        │                                    │
│              ┌─────────┴──────────┐                         │
│              │  Nervous System    │                          │
│              │  (signal bus)      │                          │
│              │                    │                          │
│  Signals:    │ middleware pipeline│                          │
│  message:in  │ audit trail (JSONL)│                          │
│  message:out │ trace correlation  │                          │
│  health:*    │ dead-signal detect │                          │
│              └─────────┬──────────┘                         │
└────────────────────────┼────────────────────────────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
┌──────┴──────┐   ┌──────┴──────┐   ┌─────┴──────┐
│  Channels   │   │  Providers  │   │  Storage   │
├─────────────┤   ├─────────────┤   ├────────────┤
│ Telegram    │   │ Claude API  │   │ Filesystem │
│ HTTP        │   │ Claude CLI  │   │ (JSONL +   │
│             │   │ Gemini API  │   │  markdown) │
│             │   │ Gemini CLI  │   │            │
│             │   │ Mock        │   │            │
└─────────────┘   └─────────────┘   └────────────┘
       │
┌──────┴──────┐
│ Scheduler   │
├─────────────┤
│ node-cron   │
│ tasks.json  │
│ → bus.fire()│
└─────────────┘
```

## Message Flow

When a user sends a message in Telegram:

1. **TelegramChannel** receives the message via grammy
2. **Auth check**: `_isAllowed()` verifies the sender is in `TELEGRAM_ALLOWED_USERS` (deny-by-default)
3. **Nervous System**: Channel fires `message:in` with `{text, chatId, userId, channel, timestamp}` — middleware logs it, audit trail records it, traceId is generated
4. **AgentLoop** picks up `message:in`, derives session ID: `telegram-{chatId}`
5. **ContextBuilder** assembles the prompt:
   - System prompt: identity + memory (working + episodic + semantic)
   - Messages: session history (last 20) + current user message
6. **Provider.chat()** sends to LLM and gets response
7. **Memory extraction**: Parse `<memory>` tags from response, append to daily log
8. **User preference extraction**: Parse `<user>` tags, append to USER.md
9. **Bootstrap detection**: If `<bootstrap-complete/>` found, delete BOOTSTRAP.md
10. **Session save**: Append user message + clean response to `data/sessions/{sessionId}.jsonl`
11. **Nervous System**: Agent fires `message:out` with `{text, chatId, channel}` — trace middleware links to original `message:in` traceId
12. **TelegramChannel** picks up `message:out`, formats markdown to HTML, sends to user (chunked if > 4000 chars)

## Core Components

### Nervous System (`src/nervous/`)

Signal-aware event bus with middleware pipeline and audit trail. Extends `EventEmitter` — all existing `bus.on()` patterns work unchanged. Producers use `bus.fire()` to create typed Signal envelopes with source attribution and trace correlation.

Built-in middleware (registered in `app.js`):
- **Trace propagation**: Links `message:in` → `message:out` via shared traceId per chatId
- **Logging**: Logs all signals through the structured logger (skips `thinking:start`)
- **Dead signal detection**: Warns when a signal has zero listeners

See [Nervous System](../features/nervous-system/) for the full feature documentation and [Signal Schema](events.md) for signal type details.

| Signal | Source | Listener | Payload |
|--------|--------|----------|---------|
| `message:in` | Channels, Scheduler | AgentLoop | `{text, chatId, userId, channel, timestamp}` |
| `message:out` | AgentLoop | Channels | `{text, chatId, channel}` |
| `thinking:start` | TypingIndicator | TelegramChannel | `{chatId, channel}` |
| `error` | Any | App (error handler) | `{source, error, context}` |
| `health:*` | Watchdog | Notifications | `{previous, detail}` |
| `config:changed` | Post-processors | Audit trail | `{reason}` |
| `notification` | Notifications | TelegramChannel | `{chatId, text}` |

### Agent Loop (`src/agent/loop.js`)

The core reasoning engine. Handles the full lifecycle of a message:

- Listens for `message:in` events
- Builds context via ContextBuilder
- Calls the provider with assembled context
- Extracts `<memory>` tags from responses
- Saves to session history
- Emits `message:out`

### Context Builder (`src/agent/context.js`)

Assembles the system prompt and message history for each provider call.

**System prompt structure:**
```
[SOUL.md — core personality and values]
---
[IDENTITY.md — technical expertise and boundaries]
---
## User Profile
[USER.md — user preferences, timezone, language]
### How to update user preferences
[<user> tag instructions]
---
## First Conversation — Bootstrap     ← only when BOOTSTRAP.md exists
[BOOTSTRAP.md — onboarding flow]
---
## Memory
[Instructions for <memory> tags]
### Long-term memory
[MEMORY.md content]
### Recent notes
[Last N days of daily logs]
```

**Messages array:** Last 20 messages from the session + current user message.

### Cognitive System (`src/cognitive/`)

The brain of KenoBot. Orchestrates four sub-systems:

- **Memory System**: Four-tier memory (working, episodic, semantic, procedural)
- **Identity System**: Core personality, behavioral rules, learned user preferences
- **Retrieval Engine**: Keyword + confidence-based selective memory recall
- **Consolidation**: Sleep cycle, memory pruning, error analysis

See [Cognitive System](../features/cognitive-system/) for the full feature documentation.

## Interfaces & Contracts

### BaseProvider (`src/providers/base.js`)

```javascript
class BaseProvider {
  async chat(messages, options = {}) { /* returns {content, toolCalls, stopReason, rawContent, usage} */ }
  get name() { /* returns string */ }
}
```

Five implementations: `claude-api` (Anthropic SDK), `claude-cli` (subprocess), `gemini-api` (Google GenAI SDK), `gemini-cli` (subprocess), `mock` (testing).

### BaseChannel (`src/channels/base.js`)

Template Method pattern — common auth logic in base, I/O specifics in subclass.

```javascript
class BaseChannel extends EventEmitter {
  async start() {}           // Start listening
  async stop() {}            // Cleanup
  async send(chatId, text) {} // Send message
  get name() {}              // Channel identifier

  // Inherited (don't override):
  _publishMessage(message)   // Auth check → bus emit
  _isAllowed(userId)         // Deny-by-default allowlist check
}
```

Two implementations: `telegram` (grammy), `http` (webhook with HMAC).

### BaseStorage (`src/storage/base.js`)

```javascript
class BaseStorage {
  async loadSession(sessionId) {}           // Returns last 20 messages
  async saveSession(sessionId, messages) {} // Append messages
  async readFile(path) {}                   // Read arbitrary file
}
```

One implementation: `filesystem` (JSONL sessions + markdown files).

## Design Patterns

### 1. Nervous System (Signal Bus)

All components are decoupled through signals. The Nervous System adds middleware (trace, logging, dead-signal detection) and audit (JSONL persistence) on top of the EventEmitter pattern. Adding a new channel (Discord, WhatsApp) requires zero changes to the agent or providers.

### 2. Context Injection

Each provider call is stateless. Context (identity, memory, history) is injected as text in every prompt. Providers don't manage state.

### 3. Markdown Memory

Memory stored as plain markdown files. Git-versionable, human-readable, zero-dependency. Daily rotation built in.

### 4. JSONL Sessions

One JSON object per line, append-only. Safe for concurrent writes, streamable, git-friendly diffs.

### 5. Template Method Channels

Base class handles auth and bus wiring. Subclasses only implement I/O. New channels are < 100 LOC.

### 6. Deny by Default

If `allowFrom` is empty or missing, **all messages are rejected**. Fail closed, not open.

### 7. Max Iterations

Tool execution loop has a configurable safety limit (default: 20). If the agent is still requesting tools after 20 iterations, it stops and returns an error message.

## Data Flow

All runtime data lives in `~/.kenobot/data/` (or `$KENOBOT_HOME/data/`):

```
~/.kenobot/data/
  sessions/
    telegram-123456789.jsonl    # Per-chat append-only history
    http-request-uuid.jsonl     # Transient HTTP sessions
  memory/
    MEMORY.md                   # Long-term curated facts
    2026-02-07.md               # Today's auto-extracted notes
    2026-02-06.md               # Yesterday
  nervous/
    signals/
      2026-02-07.jsonl          # Nervous System audit trail (daily rotation)
  logs/
    kenobot-2026-02-07.log      # Structured JSONL (daily rotation)
  scheduler/
    tasks.json                  # Persistent cron task definitions
  kenobot.pid                   # PID file (when running as daemon)
```

## Limits & Constraints

| Constraint | Value | Configurable |
|-----------|-------|-------------|
| Session history | Last 20 messages per session | Yes (`SESSION_HISTORY_LIMIT`) |
| Max tool iterations | 20 rounds per message | Yes (`MAX_TOOL_ITERATIONS`) |
| Telegram message chunk | 4000 characters | No (Telegram API limit) |
| MEMORY.md size | Unlimited | No (grows with usage) |
| Daily logs retention | 30 days (compacted into MEMORY.md) | Yes (`MEMORY_RETENTION_DAYS`) |
| System prompt budget | No token limit enforced | No |
| Provider timeout | 120s (CLI), none (API) | No |

**Known scaling risks:**
- Long conversations with large MEMORY.md and many daily logs can approach the model's context window (~200K tokens for Claude). No automatic truncation is in place — the provider will return an error if the context is exceeded.
- Daily logs are automatically compacted after 30 days (configurable via `MEMORY_RETENTION_DAYS`). Unique entries are merged into MEMORY.md and old log files are deleted.

## Composition Root

KenoBot separates side effects from component wiring:

- **`src/app.js`** — Pure factory. `createApp(config, provider)` builds and wires all components (Nervous System, Cognitive System, Agent Loop, Channels, Watchdog, Scheduler), returns an app object with `start()`/`stop()`. No global side effects. Can be called multiple times for isolated instances.

- **`src/index.js`** — Thin entry point. Handles config loading (env vars, `.env` file), provider self-registration (side-effect imports), process signal handlers (`SIGTERM`, `SIGINT`), and calls `createApp()`.

This separation enables programmatic boot for E2E testing:

```javascript
import { createConfig } from './config.js'
import { createApp } from './app.js'

const { config } = createConfig({ PROVIDER: 'mock', TELEGRAM_BOT_TOKEN: 'test', ... })
const app = createApp(config, mockProvider)
await app.start()
// ... send messages via app.bus, assert results
await app.stop()
```

The `createApp()` return object exposes all internal components (`bus`, `agent`, `channels`, `watchdog`, `scheduler`, `storage`, `memory`, `cognitive`, etc.) for diagnostics and testing.

## Extending KenoBot

### Add a new Provider

1. Create `src/providers/my-provider.js` extending `BaseProvider`
2. Implement `chat(messages, options)` and `get name()`
3. Call `registerProvider('my-provider', (config) => new MyProvider(config))` at the bottom
4. Import the file in `src/index.js` for self-registration
5. Set `PROVIDER=my-provider` in `.env`

### Add a new Channel

1. Create `src/channels/my-channel.js` extending `BaseChannel`
2. Implement `start()`, `stop()`, `send()`, `get name()`
3. Call `_publishMessage()` when messages arrive (auth is inherited)
4. Listen for `message:out` on the bus to send responses
5. Register in `src/index.js`
