# Architecture

> Event-driven message bus with pluggable components. Every piece is swappable without touching the core.

## Overview

KenoBot follows an **event-driven architecture** where all components communicate through a singleton EventEmitter bus. No component calls another directly — they emit and listen to events.

```
┌─────────────────────────────────────────────────────────────┐
│                       KenoBot Core                          │
│                                                             │
│  ┌────────────┐  ┌───────────┐  ┌──────────────────────┐   │
│  │  Context    │  │   Agent   │  │     Memory           │   │
│  │  Builder    │  │   Loop    │  │     Manager          │   │
│  │            │  │           │  │                      │   │
│  │ identity   │  │ receive   │  │ daily notes          │   │
│  │ memory     │  │ build     │  │ MEMORY.md            │   │
│  │ history    │  │ execute   │  │ auto-extraction      │   │
│  │ skills     │  │ respond   │  │                      │   │
│  └────────────┘  └─────┬─────┘  └──────────────────────┘   │
│                        │                                    │
│                  ┌─────┴──────┐                             │
│                  │    Bus     │  (EventEmitter)             │
│                  │            │                             │
│  Events:         │ message:in │  message:out               │
│                  │ thinking   │  error                     │
│                  └─────┬──────┘                             │
└────────────────────────┼────────────────────────────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
┌──────┴──────┐   ┌──────┴──────┐   ┌─────┴──────┐
│  Channels   │   │  Providers  │   │  Storage   │
├─────────────┤   ├─────────────┤   ├────────────┤
│ Telegram    │   │ Claude API  │   │ Filesystem │
│ HTTP        │   │ Claude CLI  │   │ (JSONL +   │
│             │   │ Mock        │   │  markdown) │
└─────────────┘   └─────────────┘   └────────────┘
       │
┌──────┴──────┐   ┌─────────────┐
│    Tools    │   │   Skills    │
├─────────────┤   ├─────────────┤
│ web_fetch   │   │ weather/    │
│ n8n_trigger │   │ daily-      │
│ schedule    │   │  summary/   │
└─────────────┘   └─────────────┘
```

## Message Flow

When a user sends a message in Telegram:

1. **TelegramChannel** receives the message via grammy
2. **Auth check**: `_isAllowed()` verifies the sender is in `TELEGRAM_ALLOWED_CHAT_IDS` (deny-by-default)
3. **Bus publish**: Channel emits `message:in` with `{text, chatId, userId, channel, timestamp}`
4. **AgentLoop** picks up `message:in`, derives session ID: `telegram-{chatId}`
5. **Trigger check**: Registry checks if message matches a tool slash command (e.g. `/fetch`)
6. **ContextBuilder** assembles the prompt:
   - System prompt: identity + available tools + available skills + active skill prompt + memory (MEMORY.md + recent daily logs + instructions)
   - Messages: session history (last 20) + current user message
7. **Provider.chat()** sends to LLM and gets response
8. **Tool loop**: If response contains `toolCalls`, execute them in parallel, feed results back to LLM, repeat (max 20 iterations)
9. **Memory extraction**: Parse `<memory>` tags from response, append to daily log
10. **Session save**: Append user message + clean response to `data/sessions/{sessionId}.jsonl`
11. **Bus publish**: Agent emits `message:out` with `{text, chatId, channel}`
12. **TelegramChannel** picks up `message:out`, formats markdown to HTML, sends to user (chunked if > 4000 chars)

## Core Components

### Bus (`src/bus.js`)

Singleton EventEmitter with no listener limit. All inter-component communication flows through it.

| Event | Emitter | Listener | Payload |
|-------|---------|----------|---------|
| `message:in` | Channels, Scheduler | AgentLoop | `{text, chatId, userId, channel, timestamp}` |
| `message:out` | AgentLoop | Channels | `{text, chatId, channel}` |
| `thinking:start` | AgentLoop | TelegramChannel | `{chatId, channel}` |
| `error` | Any | index.js (logger) | `{source, error, context}` |

### Agent Loop (`src/agent/loop.js`)

The core reasoning engine. Handles the full lifecycle of a message:

- Listens for `message:in` events
- Checks for slash command triggers (tool regex matching)
- Builds context via ContextBuilder
- Calls the provider with assembled context
- Runs the tool execution loop (parallel tool calls, max iterations safety valve)
- Extracts `<memory>` tags from responses
- Saves to session history
- Emits `message:out`

### Context Builder (`src/agent/context.js`)

Assembles the system prompt and message history for each provider call.

**System prompt structure:**
```
[Identity file (identities/kenobot.md)]

---

## Available tools
- web_fetch: Fetch a web page and return its text content
- schedule: Schedule a recurring or one-time task
- n8n_trigger: Trigger an n8n workflow via webhook

---

## Available skills
- weather: Get weather forecasts and current conditions
- daily-summary: Generate a summary of your day

---

## Active skill: weather
[Full SKILL.md content loaded on-demand]

---

## Memory
[Instructions for <memory> tags]

### Long-term memory
[MEMORY.md content]

### Recent notes
[Last N days of daily logs]
```

**Messages array:** Last 20 messages from the session + current user message.

### Memory Manager (`src/agent/memory.js`)

Two-tier memory system:

- **MEMORY.md** (`data/memory/MEMORY.md`): Long-term curated facts. Human or agent-editable.
- **Daily logs** (`data/memory/YYYY-MM-DD.md`): Append-only daily notes. Auto-extracted from `<memory>` tags in responses.

The agent is instructed to use `<memory>` tags for facts worth remembering. The memory extractor strips these from the user-facing response and appends them to the daily log.

## Interfaces & Contracts

### BaseProvider (`src/providers/base.js`)

```javascript
class BaseProvider {
  async chat(messages, options = {}) { /* returns {content, toolCalls, stopReason, rawContent, usage} */ }
  get name() { /* returns string */ }
}
```

Three implementations: `claude-api` (Anthropic SDK), `claude-cli` (subprocess), `mock` (testing).

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

### BaseTool (`src/tools/base.js`)

```javascript
class BaseTool {
  get definition() {}        // {name, description, input_schema} for LLM
  get trigger() {}           // Optional regex for slash commands (e.g. /fetch)
  parseTrigger(match) {}     // Parse regex match into tool input
  async execute(input) {}    // Run the tool, return string result
}
```

Three built-in tools: `web_fetch`, `n8n_trigger`, `schedule`.

## Design Patterns

### 1. CLI Wrapping

The `claude-cli` provider wraps the official Claude CLI as a subprocess instead of reimplementing authentication. ToS-compliant, maintained by Anthropic.

### 2. Message Bus

All components are decoupled through events. Adding a new channel (Discord, WhatsApp) requires zero changes to the agent or providers.

### 3. Context Injection

Each provider call is stateless. Context (identity, memory, history) is injected as text in every prompt. Providers don't manage state.

### 4. Markdown Memory

Memory stored as plain markdown files. Git-versionable, human-readable, zero-dependency. Daily rotation built in.

### 5. JSONL Sessions

One JSON object per line, append-only. Safe for concurrent writes, streamable, git-friendly diffs.

### 6. Template Method Channels

Base class handles auth and bus wiring. Subclasses only implement I/O. New channels are < 100 LOC.

### 7. Deny by Default

If `allowFrom` is empty or missing, **all messages are rejected**. Fail closed, not open.

### 8. On-Demand Skills

System prompt includes a compact skill list (~50 bytes per skill). Full SKILL.md is only loaded when a message triggers the skill. Keeps context budget small.

### 9. Tool Triggers

Tools can define a regex trigger for slash commands (`/fetch`, `/schedule`, `/n8n`). This works with any provider, including `claude-cli` which doesn't support native tool_use.

### 10. Max Iterations

Tool execution loop has a configurable safety limit (default: 20). If the agent is still requesting tools after 20 iterations, it stops and returns an error message.

## Data Flow

```
data/
  sessions/
    telegram-123456789.jsonl    # Per-chat append-only history
    http-request-uuid.jsonl     # Transient HTTP sessions
  memory/
    MEMORY.md                   # Long-term curated facts
    2026-02-07.md               # Today's auto-extracted notes
    2026-02-06.md               # Yesterday
  logs/
    kenobot-2026-02-07.log      # Structured JSONL (daily rotation)
  scheduler/
    tasks.json                  # Persistent cron task definitions
```

## Extending KenoBot

### Add a new Provider

1. Create `src/providers/my-provider.js` extending `BaseProvider`
2. Implement `chat(messages, options)` and `get name()`
3. Add a case in `src/index.js` switch statement
4. Set `PROVIDER=my-provider` in `.env`

### Add a new Channel

1. Create `src/channels/my-channel.js` extending `BaseChannel`
2. Implement `start()`, `stop()`, `send()`, `get name()`
3. Call `_publishMessage()` when messages arrive (auth is inherited)
4. Listen for `message:out` on the bus to send responses
5. Register in `src/index.js`

### Add a new Tool

1. Create `src/tools/my-tool.js` extending `BaseTool`
2. Implement `get definition()` and `execute(input)`
3. Optionally add `get trigger()` and `parseTrigger()` for slash commands
4. Register in `src/index.js`: `toolRegistry.register(new MyTool())`

### Add a new Skill

1. Create `skills/my-skill/manifest.json`:
   ```json
   {
     "name": "my-skill",
     "description": "What this skill does",
     "triggers": ["keyword1", "keyword2"]
   }
   ```
2. Create `skills/my-skill/SKILL.md` with agent instructions
3. Restart the bot — skill is auto-discovered
