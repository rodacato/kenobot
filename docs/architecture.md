# Architecture

> Event-driven architecture with two bounded contexts: the **Nervous System** (signaling) and the **Cognitive System** (memory & identity). Every piece is swappable without touching the core.
>
> Design rationale and research notes are in `docs/design/`.

## Table of Contents

1. [Overview](#overview)
2. [Message Flow](#message-flow)
3. [Core Components](#core-components)
4. [Nervous System](#nervous-system)
5. [Cognitive System](#cognitive-system)
6. [Interfaces & Contracts](#interfaces--contracts)
7. [Design Patterns](#design-patterns)
8. [Data Flow](#data-flow)
9. [Limits & Constraints](#limits--constraints)
10. [Composition Root](#composition-root)
11. [Extending KenoBot](#extending-kenobot)

---

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

---

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

```
User → Telegram
         ↓
     BaseChannel._publishMessage()
         ↓
     bus.fire('message:in', payload, { source: 'telegram' })
         ↓
     [Middleware: trace stores traceId for chatId]
     [Middleware: logging → logger.info('nervous', 'message:in', ...)]
     [Middleware: dead-signal → checks listener count]
     [Audit Trail: append to JSONL]
         ↓
     AgentLoop.onMessage(payload)
         ↓
     bus.fire('thinking:start', ..., { source: 'agent' })   ← reflex (no brain)
         ↓
     Provider.chat() → response
         ↓
     bus.fire('message:out', payload, { source: 'agent' })
         ↓
     [Middleware: trace links outgoing traceId to incoming]
         ↓
     TelegramChannel.send() → User
```

---

## Core Components

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

---

## Nervous System

> Signal-aware event backbone built on principles from neuroscience and enterprise integration patterns.

The Nervous System (`src/nervous/`) is the **signaling backbone** — how the brain (Cognitive System + Agent Loop) communicates with the body (Channels, Watchdog, Scheduler). It replaces the primitive EventEmitter bus with a signal-aware system that traces, logs, and audits every signal flowing through the bot.

```
┌─────────────────────────────────────────┐
│         Nervous System                  │
│                                         │
│  Signal → Middleware → Audit → Deliver  │
│                                         │
│  fire()     trace      JSONL    emit()  │
│             logging                     │
│             dead-signal                 │
└─────────────────────────────────────────┘
```

**Key Features:**
- **Signal envelopes** — Every event carries metadata (source, traceId, timestamp)
- **Middleware pipeline** — Intercept, enrich, or block signals before delivery
- **Audit trail** — Automatic JSONL log of all signals, queryable by type/traceId/time
- **Trace correlation** — Follow a message from input through processing to response
- **Dead signal detection** — Warns when signals fire with zero listeners
- **Backward compatible** — All existing `bus.on()` listeners work unchanged

### Conceptual Foundations

#### The Biological Nervous System

The Nervous System metaphor describes how KenoBot's components actually relate:

| Biology | Software | Role |
|---------|----------|------|
| Sensory neurons | Channels (receive) | Bring information from the outside world |
| Motor neurons | Channels (send) | Send responses back to the outside world |
| Spinal cord | NervousSystem (bus) | Routes signals between components |
| Brain | AgentLoop + Cognitive System | Processes information, forms memories, decides |
| Reflex arc | TypingIndicator | Automatic response without brain involvement |
| Autonomic system | Watchdog, Scheduler | Unconscious monitoring and maintenance |
| Pain signals | Error/Health events | Alert the system that something is wrong |
| Myelin sheath | Middleware | Protects and accelerates signal transmission |
| Neural trace | Audit trail | Record of all signals that fired |
| Inhibition | Middleware `return false` | Block a signal from reaching its target |
| Neurotransmitters | Signal payloads | The actual data being transmitted |
| Synapses | Event listeners | Connection points between neurons/components |

#### Enterprise Integration Patterns (Hohpe & Woolf)

The Nervous System implements several patterns from *Enterprise Integration Patterns*:

| EIP Pattern | Implementation |
|-------------|---------------|
| **Message** | `Signal` class — typed envelope with metadata |
| **Publish-Subscribe Channel** | `EventEmitter` — multiple listeners per signal type |
| **Pipes and Filters** | Middleware pipeline — chain of processing steps |
| **Wire Tap** | Logging middleware + audit trail — observe without modifying |
| **Dead Letter Channel** | Dead signal detection — catch undelivered signals |
| **Correlation Identifier** | `traceId` — links related signals across time |

#### Domain-Driven Design

The Nervous System is a **bounded context** — a self-contained module with its own domain model (Signal), its own persistence (audit trail), and a clear API boundary (NervousSystem facade). It follows the same structural pattern as the Cognitive System:

```
src/cognitive/              src/nervous/
  index.js    (facade)        index.js    (facade)
  memory/     (sub-system)    middleware.js (sub-system)
  identity/   (sub-system)    audit-trail.js (sub-system)
  retrieval/  (sub-system)    signal.js   (domain model)
```

### File Structure

```
src/nervous/
  index.js          — NervousSystem facade (extends EventEmitter, adds fire/use/audit)
  signal.js         — Signal class (typed event envelope with metadata)
  signals.js        — Signal type constants (re-exports from events.js)
  middleware.js     — Built-in middleware (trace propagation, logging, dead-signal)
  audit-trail.js   — JSONL signal persistence with query support

src/events.js       — Signal type constants (canonical source, kept for backward compat)
```

### Core Components

#### Signal (`src/nervous/signal.js`)

The fundamental unit of communication. Wraps a raw event payload with metadata:

```javascript
import Signal from './nervous/signal.js'

const signal = new Signal('message:in', { text: 'hello', chatId: 42 }, {
  source: 'telegram',
  traceId: 'custom-id'  // optional — auto-generated UUID if omitted
})

signal.type       // 'message:in'
signal.payload    // { text: 'hello', chatId: 42 }
signal.source     // 'telegram'
signal.traceId    // 'custom-id'
signal.timestamp  // 1707900000000

signal.toJSON()   // serializable for audit trail
```

**Design decision**: Listeners receive the raw `payload`, not the Signal. This preserves backward compatibility — existing `bus.on('message:in', (payload) => ...)` handlers work unchanged. The Signal envelope is visible only to middleware and the audit trail.

#### NervousSystem (`src/nervous/index.js`)

The facade. Extends `EventEmitter`, adds `fire()`, middleware, and audit:

```javascript
import NervousSystem from './nervous/index.js'

const bus = new NervousSystem({ logger, dataDir: '/path/to/data' })

// Register middleware (runs on every fire())
bus.use((signal) => {
  console.log(signal.type, signal.source)
})

// Register listeners (unchanged from EventEmitter)
bus.on('message:in', (payload) => {
  console.log(payload.text)
})

// Fire a signal (new API — creates Signal, runs middleware, audits, delivers)
bus.fire('message:in', { text: 'hello' }, { source: 'telegram' })

// Legacy emit still works (bypasses middleware — for gradual migration)
bus.emit('message:in', { text: 'hello' })
```

#### AuditTrail (`src/nervous/audit-trail.js`)

Persistent signal log in JSONL format. Non-blocking writes (fire-and-forget with error logging):

```javascript
const trail = bus.getAuditTrail()

// Query signals
const signals = await trail.query({
  type: 'message:in',           // filter by type
  traceId: 'abc-123',           // filter by correlation ID
  since: Date.now() - 3600000,  // last hour
  limit: 50                     // max results
})
```

### Signal Types

All signal types are defined in `src/events.js` and re-exported from `src/nervous/signals.js`. See [events.md](events.md) for the full signal schema.

#### Message Flow

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `message:in` | Channels, Scheduler | AgentLoop | `{ text, chatId, userId, channel, timestamp }` |
| `message:out` | AgentLoop | Channels | `{ text, chatId, channel }` |
| `thinking:start` | TypingIndicator | TelegramChannel | `{ chatId, channel }` |

#### System Events

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `error` | Any component | App (error handler) | `{ source, error, context? }` |
| `config:changed` | Post-processors | Audit trail (logged) | `{ reason }` |
| `notification` | Notifications | TelegramChannel | `{ chatId, text }` |

#### Health Monitoring (Autonomic)

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `health:degraded` | Watchdog | Notifications | `{ previous, detail }` |
| `health:unhealthy` | Watchdog | Notifications | `{ previous, detail }` |
| `health:recovered` | Watchdog | Notifications | `{ previous, detail }` |

#### Approval Workflow (Reserved)

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `approval:proposed` | (future) | Notifications | `{ id, type, name }` |
| `approval:approved` | (future) | (future) | -- |
| `approval:rejected` | (future) | (future) | -- |

### Middleware Pipeline

Middleware functions intercept every `fire()` call before the signal reaches listeners. Registered via `bus.use(fn)` in the composition root (`src/app.js`).

#### Middleware Signature

```javascript
// (signal: Signal) => void | false
// Return void to allow delivery
// Return false to inhibit (block) the signal

bus.use((signal) => {
  if (signal.payload.text?.includes('spam')) {
    return false  // block delivery
  }
})
```

#### Built-in Middleware

Three middleware are registered by default in `src/app.js`:

**1. Trace Propagation** — Links `message:in` to `message:out` via shared traceId per chatId. Enables end-to-end request tracing. (EIP Correlation Identifier)

```
message:in  { chatId: 42 }  traceId: 'abc-123'  ← stores trace
     ↓ (agent processing)
message:out { chatId: 42 }  traceId: 'abc-123'  ← linked automatically
```

**2. Logging** — Logs every signal through the structured logger. Skips noisy signals (`thinking:start`) by default. (EIP Wire Tap)

```
logger.info('nervous', 'message:in', { source: 'telegram', traceId: '...' })
```

**3. Dead Signal Detection** — Warns when a signal fires with zero listeners. Catches unused events early. (EIP Dead Letter Channel)

```
logger.warn('nervous', 'dead_signal', { type: 'config:changed', source: '...' })
```

#### Middleware Execution Order

Middleware runs in registration order. If any middleware returns `false`, subsequent middleware and the listener delivery are skipped:

```
fire('test', payload)
  → middleware[0]  ← runs
  → middleware[1]  ← returns false (inhibit)
  → middleware[2]  ← skipped
  → listeners      ← skipped
```

#### Custom Middleware Examples

```javascript
// Rate limiter
bus.use((signal) => {
  if (signal.type === 'message:in') {
    if (rateLimiter.isExceeded(signal.payload.chatId)) {
      return false  // block delivery
    }
  }
})

// Metrics collection
bus.use((signal) => {
  metrics.increment(`signals.${signal.type}`)
})

// Payload enrichment
bus.use((signal) => {
  if (signal.type === 'message:in') {
    signal.payload.receivedAt = Date.now()
  }
})
```

### Audit Trail

All signals (except excluded types) are automatically logged to JSONL files:

```
{dataDir}/nervous/signals/YYYY-MM-DD.jsonl
```

#### Format

One JSON line per signal:

```json
{"type":"message:in","source":"telegram","traceId":"a1b2c3d4-...","timestamp":1707900000000,"payload":{"text":"hello","chatId":42}}
```

#### Excluded Signals

`thinking:start` is excluded by default (fires every 4 seconds during processing — too noisy for audit).

#### Querying

```javascript
const trail = bus.getAuditTrail()

// All message:in signals from the last hour
const inputs = await trail.query({
  type: 'message:in',
  since: Date.now() - 3600000
})

// Reconstruct a full request-response trace
const trace = await trail.query({ traceId: 'abc-123' })
// → [{ type: 'message:in', ... }, { type: 'message:out', ... }]
```

### Health Monitoring Flow (Autonomic System)

```
Watchdog._runChecks()          (autonomic — runs on timer, no user involvement)
    ↓
checks provider circuit, memory usage, n8n connectivity
    ↓
state changed? → bus.fire('health:degraded', ..., { source: 'watchdog' })
    ↓                                               ↑ pain signal
Notifications listener → bus.fire('notification', ..., { source: 'notifications' })
    ↓
TelegramChannel → owner gets alert
```

### Integration with Agent Loop

The Nervous System connects all components through the Agent Loop:

1. **Channel receives message** -- `bus.fire('message:in', payload, { source: 'telegram' })`
2. **AgentLoop.onMessage()** picks up `message:in` via `bus.on()`
3. **TypingIndicator** fires `thinking:start` as a reflex -- `bus.fire('thinking:start', ..., { source: 'agent' })`
4. **Provider processes** the message (brain work)
5. **Post-processors** extract memories -- `bus.fire('config:changed', ..., { source: 'post-processor' })`
6. **AgentLoop emits response** -- `bus.fire('message:out', payload, { source: 'agent' })`
7. **Channel sends response** picks up `message:out` via `bus.on()`

The traceId links steps 1 and 6 — the same traceId from `message:in` is automatically attached to `message:out` by the trace propagation middleware.

### Nervous System API Reference

#### NervousSystem

```javascript
import NervousSystem from './nervous/index.js'
```

##### `constructor({ logger?, dataDir?, audit? })`

Create a new Nervous System instance.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `logger` | Object | `defaultLogger` | Logger instance |
| `dataDir` | string | -- | Base data directory (enables audit trail) |
| `audit` | boolean | `!!dataDir` | Override audit trail enable/disable |

##### `fire(type, payload, options?) -> Signal | false`

Fire a signal through the system.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Signal type (e.g. `'message:in'`) |
| `payload` | Object | Raw event data (delivered to listeners) |
| `options.source` | string | Component firing the signal |
| `options.traceId` | string | Correlation ID (auto-generated if omitted) |
| **Returns** | `Signal \| false` | The signal, or `false` if inhibited |

##### `use(fn)`

Register a middleware function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(Signal) => void \| false` | Middleware function |

##### `getAuditTrail() -> AuditTrail | null`

Get the audit trail instance for querying. Returns `null` if no `dataDir` configured.

##### `getStats() -> { fired, inhibited, byType }`

Get signal throughput statistics.

```javascript
const stats = bus.getStats()
// {
//   fired: 142,
//   inhibited: 3,
//   byType: { 'message:in': 42, 'message:out': 42, 'thinking:start': 55, ... }
// }
```

#### Signal

```javascript
import Signal from './nervous/signal.js'
```

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Signal type |
| `payload` | Object | Raw event data |
| `source` | string | Firing component (`'unknown'` if not provided) |
| `traceId` | string | Correlation UUID |
| `timestamp` | number | Creation time (ms since epoch) |

##### `toJSON() -> Object`

Serialize for JSONL persistence.

#### AuditTrail

```javascript
const trail = bus.getAuditTrail()
```

##### `log(signal)`

Write a signal to the audit trail (non-blocking, fire-and-forget).

##### `query(filters?) -> Promise<Object[]>`

Query signals from the audit trail.

| Filter | Type | Description |
|--------|------|-------------|
| `type` | string | Filter by signal type |
| `since` | number | Only signals after this timestamp |
| `traceId` | string | Filter by correlation ID |
| `limit` | number | Max results (default: 100) |

### Nervous System Configuration

| Setting | Source | Default | Description |
|---------|--------|---------|-------------|
| `dataDir` | `config.dataDir` | `~/.kenobot/data` | Base directory for audit trail |
| Audit trail | Automatic | Enabled when `dataDir` exists | JSONL signal logging |
| Middleware | Registered in `app.js` | trace + logging + dead-signal | Pipeline of interceptors |

No environment variables are needed — the Nervous System inherits `dataDir` from the existing config.

### Advanced: Custom Signals

1. Define constants in `src/events.js`:
   ```javascript
   export const MY_EVENT = 'my:event'
   ```

2. Fire with source identification:
   ```javascript
   bus.fire(MY_EVENT, { data: 'value' }, { source: 'my-component' })
   ```

3. Subscribe (unchanged from EventEmitter):
   ```javascript
   bus.on(MY_EVENT, (payload) => { ... })
   ```

**Naming convention**: Use `category:action` pattern (e.g., `health:degraded`, `message:in`).

### Advanced: Signal Inhibition

Middleware can block signals from reaching listeners:

```javascript
bus.use((signal) => {
  if (signal.type === 'message:in' && isBanned(signal.payload.userId)) {
    logger.warn('nervous', 'inhibited', { reason: 'banned user' })
    return false  // signal never reaches AgentLoop
  }
})
```

---

## Cognitive System

> The brain of KenoBot — how the bot thinks, remembers, and develops personality.

The Cognitive System (`src/cognitive/`) orchestrates everything the bot knows, remembers, and learns. It manages four sub-systems:

```
┌─────────────────────────────────────────────┐
│              Cognitive System                │
│              (CognitiveSystem facade)        │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Memory       │  │  Identity            │ │
│  │  System       │  │  System              │ │
│  │               │  │                      │ │
│  │  working      │  │  core personality    │ │
│  │  episodic     │  │  behavioral rules    │ │
│  │  semantic     │  │  learned preferences │ │
│  │  procedural   │  │  bootstrap           │ │
│  └──────────────┘  └──────────────────────┘ │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Retrieval    │  │  Consolidation       │ │
│  │  Engine       │  │                      │ │
│  │               │  │  sleep cycle (4ph)   │ │
│  │  keyword      │  │  consolidation       │ │
│  │  confidence   │  │  error analysis      │ │
│  └──────────────┘  │  pruning             │ │
│                     │  self-improvement    │ │
│  ┌──────────────┐  └──────────────────────┘ │
│  │ Metacognition │                           │
│  │               │                           │
│  │ self-monitor  │                           │
│  │ confidence    │                           │
│  │ reflection    │                           │
│  └──────────────┘                            │
└─────────────────────────────────────────────┘
```

**Key Features:**
- **Four-tier memory** — Working, episodic, semantic, procedural (Atkinson-Shiffrin + Tulving)
- **Modular identity** — Core personality, behavioral rules, learned user preferences
- **Selective retrieval** — Keyword + confidence-based memory recall
- **Conversational bootstrap** — Natural onboarding through observation
- **Memory consolidation** — 4-phase sleep cycle (consolidation, error analysis, pruning, self-improvement)
- **Metacognition** — Heuristic self-monitoring, confidence estimation, reflection (zero LLM cost)

### Conceptual Foundations

#### Cognitive Psychology

The Cognitive System draws from established models in cognitive psychology and neuroscience:

| Theory | Application |
|--------|-------------|
| **Atkinson-Shiffrin** (1968) | Three-stage memory model: sensory -> working -> long-term |
| **Tulving** (1972) | Distinction between episodic (events) and semantic (facts) memory |
| **Big Five** personality | Bot personality dimensions (openness, conscientiousness, etc.) |
| **Self-Schema Theory** | Immutable core identity that defines who the bot is |
| **Attachment Theory** | Critical period learning during conversational bootstrap |
| **Context-Dependent Memory** | Better retrieval when recall context matches encoding context |

#### The Brain Metaphor

The Cognitive System is the **brain** in KenoBot's biological metaphor. The Nervous System is how the brain communicates with the body:

```
Sensory input (Channels)
    ↓ via Nervous System
Brain (Cognitive System)
    ├── What do I remember? (Memory)
    ├── Who am I? (Identity)
    ├── What's relevant? (Retrieval)
    └── What should I consolidate? (Consolidation)
    ↓ via Nervous System
Motor output (Channels)
```

### Architecture

#### Facade Pattern

`CognitiveSystem` (`src/cognitive/index.js`) is the single entry point, following the same pattern as `NervousSystem`:

```javascript
const cognitive = new CognitiveSystem(config, memoryStore, provider, { logger })

// Build context for a message (memory + identity)
const context = await cognitive.buildContext(sessionId, messageText)

// Save extracted memories
await cognitive.saveMemory(sessionId, memoryTags)

// Access sub-systems directly
const memory = cognitive.getMemorySystem()
const identity = cognitive.getIdentityManager()
```

#### Component Hierarchy

```
CognitiveSystem (Facade)
├── MemorySystem (4-tier memory)
│   ├── WorkingMemory          — Session scratchpad (7-day staleness)
│   ├── EpisodicMemory         — Chat-specific events (temporal)
│   ├── SemanticMemory         — Global facts (permanent)
│   └── ProceduralMemory       — Learned patterns
│
├── IdentityManager (Personality)
│   ├── CoreLoader             — Immutable personality (cached)
│   ├── RulesEngine            — Behavioral guidelines (cached)
│   ├── PreferencesManager     — Learned user preferences (fresh read)
│   ├── BootstrapOrchestrator  — State machine for onboarding
│   └── ProfileInferrer        — LLM-based style detection
│
├── RetrievalEngine (Selective recall)
│   ├── KeywordMatcher         — Extract and match keywords
│   └── ConfidenceScorer       — Score retrieval quality
│
├── Consolidation (Maintenance)
│   ├── SleepCycle             — 4-phase scheduled consolidation
│   ├── Consolidator           — Extract facts/patterns from episodes
│   ├── ErrorAnalyzer          — Classify errors, extract lessons
│   ├── MemoryPruner           — Clean stale data, prune patterns
│   └── SelfImprover           — Generate improvement proposals
│
└── Metacognition (Self-awareness)
    ├── SelfMonitor            — Heuristic response quality gate
    ├── ConfidenceEstimator    — Retrieval confidence assessment
    └── ReflectionEngine       — Sleep-cycle pattern analysis
```

#### Isolation Guarantees

Each sub-system is independently testable:

- **Memory is isolated from Identity** — Separate directories, no cross-calls, different lifecycles
- **Memory types are isolated from each other** — Working doesn't know about Episodic
- **Retrieval is read-only** — Reads from Memory, never writes
- **Consolidation is async** — Runs on schedule, doesn't block message processing

### Sub-Systems

#### Memory System

Four-tier memory architecture inspired by human cognition:

| Memory Type | Scope | Lifecycle | Purpose |
|-------------|-------|-----------|---------|
| **Working** | Per-session | 7 days | Current task context (scratchpad) |
| **Episodic** | Per-chat | 30 days | What happened, when (events) |
| **Semantic** | Global | Permanent | What I know (facts) |
| **Procedural** | Global | Permanent | How to behave (patterns) |

**Deep dive:** [Memory System](memory.md)

#### Identity System

Three-layer identity architecture:

| Layer | Mutability | Content |
|-------|-----------|---------|
| **Core** | Immutable | Who the bot is, values, constraints |
| **Rules** | Static | Behavioral guidelines, forbidden patterns |
| **Preferences** | Dynamic | Learned user preferences, communication style |

Includes a **conversational bootstrap** that learns user preferences through natural observation rather than questionnaires.

**Deep dive:** [Identity System](identity.md)

#### Retrieval Engine

Selective memory recall to avoid loading everything on every message:

- **Keyword extraction** from user message
- **Confidence scoring** (high/medium/low/none)
- **Limits** — Configurable max facts, episodes, and procedures
- **Fallback** — Full memory load when retrieval is disabled

#### Consolidation (Sleep Cycle)

Background maintenance via a **4-phase sleep cycle** (runs hourly via `setInterval`, executes when overdue):

| Phase | Component | What it does |
|-------|-----------|--------------|
| 1. Consolidation | `Consolidator` | Loads recent episodes, filters by salience (errors, successes, corrections, novel content), extracts facts and procedural patterns |
| 2. Error Analysis | `ErrorAnalyzer` | Scans for error-like entries, classifies (internal/external/configuration), extracts lessons from internal errors |
| 3. Pruning | `MemoryPruner` | Deletes stale working memory (>7 days), removes low-confidence unused patterns, deletes daily logs >30 days, deduplicates MEMORY.md facts (Jaccard similarity) |
| 4. Self-Improvement | `SelfImprover` | Heuristic-based proposal generator — detects idle systems, recurring errors, heavy pruning; writes proposals to `data/sleep/proposals/` |

**CLI access:** `kenobot sleep` (run manually), `kenobot sleep --status`, `kenobot sleep --proposals`

#### Metacognition

Heuristic self-awareness system (zero LLM cost, zero latency):

- **SelfMonitor** — Evaluates response quality: detects hedging, repetition, length anomalies, missing context. Runs as a post-processor on every response (observe-only, logs warnings for poor quality).
- **ConfidenceEstimator** — Integrates with RetrievalEngine confidence scores, adjusts based on result counts.
- **ReflectionEngine** — Runs during sleep cycle; analyzes learning rate, error patterns, consolidation effectiveness, memory churn.

**Design decision:** All evaluation is heuristic-based. No second LLM call = zero additional cost and zero latency per message.

### File Structure

```
src/cognitive/
  index.js                          — CognitiveSystem facade
  memory/
    memory-system.js                — MemorySystem facade
    working-memory.js               — Session scratchpad
    episodic-memory.js              — Chat-specific events
    semantic-memory.js              — Global facts
    procedural-memory.js            — Learned patterns
  identity/
    identity-manager.js             — IdentityManager facade
    core-loader.js                  — Immutable personality
    rules-engine.js                 — Behavioral guidelines
    preferences-manager.js          — Learned preferences
    bootstrap-orchestrator.js       — Onboarding state machine
    profile-inferrer.js             — LLM-based style detection
  retrieval/
    retrieval-engine.js             — Selective memory recall
    keyword-matcher.js              — Keyword extraction
    confidence-scorer.js            — Retrieval quality scoring
  consolidation/
    sleep-cycle.js                  — 4-phase scheduled consolidation
    consolidator.js                 — Salience filter, fact/pattern extraction
    error-analyzer.js               — Error classification, lesson extraction
    memory-pruner.js                — Stale data cleanup, pattern pruning
    self-improver.js                — Heuristic improvement proposals
  metacognition/
    index.js                        — MetacognitionSystem facade
    self-monitor.js                 — Heuristic response quality gate
    confidence-estimator.js         — Retrieval confidence assessment
    reflection-engine.js            — Sleep-cycle pattern analysis
  utils/
    cost-tracker.js                 — LLM cost tracking
    memory-health.js                — Memory health checks
    message-batcher.js              — Message batching
    transparency.js                 — Audit/transparency helpers
```

### Integration with Agent Loop

The Cognitive System connects to the message flow through two touchpoints:

#### 1. Context Building (Before LLM Call)

```
Message arrives via Nervous System
    ↓
AgentLoop._handleMessage()
    ↓
ContextBuilder.build(sessionId, message)
    ↓
CognitiveSystem.buildContext(sessionId, messageText)
    ├── Check isBootstrapping → skip memory if true
    ├── Load identity (core + rules + preferences)
    ├── Load memory (via Retrieval Engine or full load)
    └── Return { memory, workingMemory, identity, isBootstrapping }
    ↓
Provider.chat(messages, { system })
```

#### 2. Memory Extraction (After LLM Response)

```
Provider returns response
    ↓
Post-processors extract tags:
    ├── <memory> → cognitive.saveMemory() → semantic (global facts)
    ├── <chat-memory> → cognitive.saveMemory() → episodic (chat events)
    ├── <working-memory> → cognitive.saveMemory() → working (scratchpad)
    └── <user> → identity.updatePreference() → preferences
    ↓
Response sent via Nervous System
```

### How the Bounded Contexts Interact

The Nervous System and Cognitive System are complementary. They interact through the Agent Loop: the Nervous System delivers messages to the Agent Loop, which uses the Cognitive System to build context and save memories, then fires the response back through the Nervous System.

```
Nervous System           Agent Loop              Cognitive System
─────────────      ─────────────────────      ──────────────────
bus.fire()    ───→  onMessage()
                    contextBuilder.build() ───→ cognitive.buildContext()
                                          ←─── { memory, identity }
                    provider.chat()
                    post-processors       ───→ cognitive.saveMemory()
bus.fire()    ←───  emit response
```

| | Nervous System | Cognitive System |
|---|---|---|
| **Metaphor** | Signal transmission | Thought and memory |
| **Concern** | How components communicate | What the bot knows and remembers |
| **API** | `bus.fire()`, `bus.on()` | `cognitive.buildContext()`, `cognitive.saveMemory()` |
| **Persistence** | JSONL audit trail (signals) | Markdown + JSON files (memories) |
| **Pattern** | EIP / Observer | Cognitive psychology models |
| **Location** | `src/nervous/` | `src/cognitive/` |

### Cognitive System API Reference

#### CognitiveSystem

```javascript
import CognitiveSystem from './cognitive/index.js'

const cognitive = new CognitiveSystem(config, memoryStore, provider, { logger })
```

##### `buildContext(sessionId, messageText) -> Promise<Object>`

Build memory context for a message. Returns:
```javascript
{
  memory: { longTerm, recentNotes, chatLongTerm, chatRecent },
  workingMemory: Object | null,
  retrieval?: Object,       // when retrieval is enabled
  isBootstrapping: boolean
}
```

##### `saveMemory(sessionId, memoryTags)`

Save extracted memories from response tags.

| Tag | Memory Type | Method |
|-----|-------------|--------|
| `memory` | Semantic (global facts) | `addFact()` |
| `chatMemory` | Episodic (chat events) | `addChatFact()` |
| `workingMemory` | Working (scratchpad) | `replaceWorkingMemory()` |

##### `getMemorySystem() -> MemorySystem`

Access the Memory System sub-system directly.

##### `getIdentityManager() -> IdentityManager`

Access the Identity System sub-system directly.

##### `getSleepCycle() -> SleepCycle`

Access the Sleep Cycle sub-system directly.

##### `getMetacognition() -> MetacognitionSystem`

Access the Metacognition sub-system directly.

##### `runSleepCycle() -> Promise<Object>`

Run the sleep cycle (convenience method). Returns results from all 4 phases.

##### `processBootstrapIfActive(sessionId, message, history) -> Promise<Object|null>`

Process a message during bootstrap (if active). Returns bootstrap result or `null` if not bootstrapping.

For detailed API reference of each sub-system, see:
- [Memory System API](memory.md#api-reference)
- [Identity System API](identity.md#api-reference)

### Cognitive System Configuration

| Setting | Env Variable | Default | Description |
|---------|-------------|---------|-------------|
| Memory days | `MEMORY_DAYS` | 3 | Days of recent notes to load |
| Memory retention | `MEMORY_RETENTION_DAYS` | 30 | Days before consolidation |
| Working memory staleness | `WORKING_MEMORY_STALE_DAYS` | 7 | Days before expiry |
| Retrieval | `USE_RETRIEVAL` | true | Enable selective retrieval |
| Max facts | `RETRIEVAL_LIMIT_FACTS` | 10 | Facts per retrieval |
| Max episodes | `RETRIEVAL_LIMIT_EPISODES` | 3 | Episodes per retrieval |
| Identity path | `IDENTITY_PATH` | `~/.kenobot/memory/identity` | Identity files location |

---

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

---

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

---

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

Identity and cognitive runtime data lives in `~/.kenobot/memory/`:

```
~/.kenobot/memory/
  identity/                         # Identity files
    core.md                         # Core personality
    rules.json                      # Behavioral rules
    preferences.md                  # Learned preferences
    BOOTSTRAP.md                    # Bootstrap instructions (deleted when complete)
  working/                          # Working memory (per-session)
    telegram-123456789.json
  chats/                            # Episodic memory (per-chat)
    telegram-123456789/
      MEMORY.md                     # Chat long-term
      2026-02-14.md                 # Chat daily log
  MEMORY.md                         # Global long-term facts
  2026-02-14.md                     # Global daily log
  procedural/                       # Learned patterns
    patterns.json
```

---

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

---

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

---

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

### Add a Custom Signal

1. Define constant in `src/events.js`:
   ```javascript
   export const MY_EVENT = 'my:event'
   ```
2. Fire with source attribution:
   ```javascript
   bus.fire(MY_EVENT, { data: 'value' }, { source: 'my-component' })
   ```
3. Subscribe (standard EventEmitter):
   ```javascript
   bus.on(MY_EVENT, (payload) => { ... })
   ```

**Naming convention**: Use `category:action` pattern (e.g., `health:degraded`, `message:in`).

---

**See also:**
- [Getting Started](getting-started.md) — Setup and first run
- [Configuration](configuration.md) — All environment variables and settings
- [Events](events.md) — Full signal type schema
- [Memory System](memory.md) — Four-tier memory deep dive
- [Identity System](identity.md) — Bot personality and preferences deep dive
