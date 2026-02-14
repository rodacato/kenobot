# Nervous System

> **A signal-aware event backbone built on principles from neuroscience and enterprise integration patterns**
>
> Design rationale and research notes are in `docs/design/`.

## Table of Contents

1. [Overview](#overview)
2. [Conceptual Foundations](#conceptual-foundations)
3. [Architecture](#architecture)
4. [File Structure](#file-structure)
5. [Core Components](#core-components)
6. [Signal Types](#signal-types)
7. [Middleware Pipeline](#middleware-pipeline)
8. [Audit Trail](#audit-trail)
9. [Integration with Agent Loop](#integration-with-agent-loop)
10. [API Reference](#api-reference)
11. [Testing](#testing)
12. [Configuration](#configuration)
13. [Advanced Topics](#advanced-topics)

---

## Overview

KenoBot's Nervous System is the **signaling backbone** — how the brain (Cognitive System + Agent Loop) communicates with the body (Channels, Watchdog, Scheduler). It replaces the primitive EventEmitter bus with a signal-aware system that traces, logs, and audits every signal flowing through the bot.

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

---

## Conceptual Foundations

### The Biological Nervous System

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

### Enterprise Integration Patterns (Hohpe & Woolf)

The Nervous System implements several patterns from *Enterprise Integration Patterns*:

| EIP Pattern | Implementation |
|-------------|---------------|
| **Message** | `Signal` class — typed envelope with metadata |
| **Publish-Subscribe Channel** | `EventEmitter` — multiple listeners per signal type |
| **Pipes and Filters** | Middleware pipeline — chain of processing steps |
| **Wire Tap** | Logging middleware + audit trail — observe without modifying |
| **Dead Letter Channel** | Dead signal detection — catch undelivered signals |
| **Correlation Identifier** | `traceId` — links related signals across time |

### Domain-Driven Design

The Nervous System is a **bounded context** — a self-contained module with its own domain model (Signal), its own persistence (audit trail), and a clear API boundary (NervousSystem facade). It follows the same structural pattern as the Cognitive System:

```
src/cognitive/              src/nervous/
  index.js    (facade)        index.js    (facade)
  memory/     (sub-system)    middleware.js (sub-system)
  identity/   (sub-system)    audit-trail.js (sub-system)
  retrieval/  (sub-system)    signal.js   (domain model)
```

---

## Architecture

### Signal Flow

```
Producer                 Nervous System                        Consumer
────────    ─────────────────────────────────────────    ────────────
            ┌─────────────────────────────────────┐
fire() ───→ │ 1. Create Signal (type, payload,    │
            │    source, traceId, timestamp)       │
            │                                     │
            │ 2. Run Middleware Pipeline           │
            │    trace → logging → dead-signal     │
            │    (any can return false to inhibit) │
            │                                     │
            │ 3. Log to Audit Trail               │
            │    → {dataDir}/nervous/signals/*.jsonl│
            │                                     │
            │ 4. Deliver to Listeners             │ ───→ handler(payload)
            │    super.emit(type, payload)         │
            └─────────────────────────────────────┘
```

### Message Processing Flow

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

---

## File Structure

```
src/nervous/
  index.js          — NervousSystem facade (extends EventEmitter, adds fire/use/audit)
  signal.js         — Signal class (typed event envelope with metadata)
  signals.js        — Signal type constants (re-exports from events.js)
  middleware.js     — Built-in middleware (trace propagation, logging, dead-signal)
  audit-trail.js   — JSONL signal persistence with query support

src/events.js       — Signal type constants (canonical source, kept for backward compat)
src/bus.js          — Legacy MessageBus (deprecated, kept for reference)
```

### Runtime Data

```
{dataDir}/nervous/
  signals/
    2026-02-14.jsonl    ← Today's signals (one JSON line per signal)
    2026-02-13.jsonl    ← Yesterday
    ...
```

---

## Core Components

### Signal (`src/nervous/signal.js`)

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

### NervousSystem (`src/nervous/index.js`)

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

### AuditTrail (`src/nervous/audit-trail.js`)

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

---

## Signal Types

All signal types are defined in `src/events.js` and re-exported from `src/nervous/signals.js`:

### Message Flow

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `message:in` | Channels, Scheduler | AgentLoop | `{ text, chatId, userId, channel, timestamp }` |
| `message:out` | AgentLoop | Channels | `{ text, chatId, channel }` |
| `thinking:start` | TypingIndicator | TelegramChannel | `{ chatId, channel }` |

### System Events

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `error` | Any component | App (error handler) | `{ source, error, context? }` |
| `config:changed` | Post-processors | Audit trail (logged) | `{ reason }` |
| `notification` | Notifications | TelegramChannel | `{ chatId, text }` |

### Health Monitoring (Autonomic)

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `health:degraded` | Watchdog | Notifications | `{ previous, detail }` |
| `health:unhealthy` | Watchdog | Notifications | `{ previous, detail }` |
| `health:recovered` | Watchdog | Notifications | `{ previous, detail }` |

### Approval Workflow (Reserved)

| Signal | Source | Consumers | Payload |
|--------|--------|-----------|---------|
| `approval:proposed` | (future) | Notifications | `{ id, type, name }` |
| `approval:approved` | (future) | (future) | — |
| `approval:rejected` | (future) | (future) | — |

---

## Middleware Pipeline

Middleware functions intercept every `fire()` call before the signal reaches listeners. Registered via `bus.use(fn)` in the composition root ([src/app.js](../../src/app.js)).

### Middleware Signature

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

### Built-in Middleware

Three middleware are registered by default in `src/app.js`:

#### 1. Trace Propagation

Links `message:in` to `message:out` via shared traceId per chatId. Enables end-to-end request tracing.

```
message:in  { chatId: 42 }  traceId: 'abc-123'  ← stores trace
     ↓ (agent processing)
message:out { chatId: 42 }  traceId: 'abc-123'  ← linked automatically
```

**Pattern**: EIP Correlation Identifier.

#### 2. Logging

Logs every signal through the structured logger. Skips noisy signals (`thinking:start`) by default.

```
logger.info('nervous', 'message:in', { source: 'telegram', traceId: '...' })
```

**Pattern**: EIP Wire Tap.

#### 3. Dead Signal Detection

Warns when a signal fires with zero listeners. Catches unused events early.

```
logger.warn('nervous', 'dead_signal', { type: 'config:changed', source: '...' })
```

**Pattern**: EIP Dead Letter Channel.

### Middleware Execution Order

Middleware runs in registration order. If any middleware returns `false`, subsequent middleware and the listener delivery are skipped:

```
fire('test', payload)
  → middleware[0]  ← runs
  → middleware[1]  ← returns false (inhibit)
  → middleware[2]  ← skipped
  → listeners      ← skipped
```

### Custom Middleware Examples

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

---

## Audit Trail

All signals (except excluded types) are automatically logged to JSONL files:

```
{dataDir}/nervous/signals/YYYY-MM-DD.jsonl
```

### Format

One JSON line per signal:

```json
{"type":"message:in","source":"telegram","traceId":"a1b2c3d4-...","timestamp":1707900000000,"payload":{"text":"hello","chatId":42}}
```

### Excluded Signals

`thinking:start` is excluded by default (fires every 4 seconds during processing — too noisy for audit).

### Querying

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

---

## Integration with Agent Loop

The Nervous System connects all components through the Agent Loop:

1. **Channel receives message** → `bus.fire('message:in', payload, { source: 'telegram' })`
2. **AgentLoop.onMessage()** picks up `message:in` via `bus.on()`
3. **TypingIndicator** fires `thinking:start` as a reflex → `bus.fire('thinking:start', ..., { source: 'agent' })`
4. **Provider processes** the message (brain work)
5. **Post-processors** extract memories → `bus.fire('config:changed', ..., { source: 'post-processor' })`
6. **AgentLoop emits response** → `bus.fire('message:out', payload, { source: 'agent' })`
7. **Channel sends response** picks up `message:out` via `bus.on()`

The traceId links steps 1 and 6 — the same traceId from `message:in` is automatically attached to `message:out` by the trace propagation middleware.

---

## API Reference

### NervousSystem

```javascript
import NervousSystem from './nervous/index.js'
```

#### `constructor({ logger?, dataDir?, audit? })`

Create a new Nervous System instance.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `logger` | Object | `defaultLogger` | Logger instance |
| `dataDir` | string | — | Base data directory (enables audit trail) |
| `audit` | boolean | `!!dataDir` | Override audit trail enable/disable |

#### `fire(type, payload, options?) → Signal | false`

Fire a signal through the system.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Signal type (e.g. `'message:in'`) |
| `payload` | Object | Raw event data (delivered to listeners) |
| `options.source` | string | Component firing the signal |
| `options.traceId` | string | Correlation ID (auto-generated if omitted) |
| **Returns** | `Signal \| false` | The signal, or `false` if inhibited |

#### `use(fn)`

Register a middleware function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(Signal) => void \| false` | Middleware function |

#### `getAuditTrail() → AuditTrail | null`

Get the audit trail instance for querying. Returns `null` if no `dataDir` configured.

#### `getStats() → { fired, inhibited, byType }`

Get signal throughput statistics.

### Signal

```javascript
import Signal from './nervous/signal.js'
```

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Signal type |
| `payload` | Object | Raw event data |
| `source` | string | Firing component (`'unknown'` if not provided) |
| `traceId` | string | Correlation UUID |
| `timestamp` | number | Creation time (ms since epoch) |

#### `toJSON() → Object`

Serialize for JSONL persistence.

### AuditTrail

```javascript
const trail = bus.getAuditTrail()
```

#### `log(signal)`

Write a signal to the audit trail (non-blocking, fire-and-forget).

#### `query(filters?) → Promise<Object[]>`

Query signals from the audit trail.

| Filter | Type | Description |
|--------|------|-------------|
| `type` | string | Filter by signal type |
| `since` | number | Only signals after this timestamp |
| `traceId` | string | Filter by correlation ID |
| `limit` | number | Max results (default: 100) |

---

## Testing

Tests mirror the source structure in `test/nervous/`:

```
test/nervous/
  signal.test.js              — Signal class unit tests
  nervous-system.test.js      — NervousSystem facade (fire, middleware, stats, audit)
  middleware.test.js           — Built-in middleware (trace, logging, dead-signal)
  audit-trail.test.js          — JSONL persistence and query (uses real temp dirs)
```

### Testing the Nervous System in Other Tests

When testing components that use the bus:

```javascript
import NervousSystem from '../../src/nervous/index.js'

const bus = new NervousSystem()  // no dataDir = no audit trail (lightweight)
```

For components that only need `fire()` and `on()`:

```javascript
const bus = { fire: vi.fn(), on: vi.fn(), emit: vi.fn() }
```

---

## Configuration

The Nervous System is configured through the composition root (`src/app.js`):

| Setting | Source | Default | Description |
|---------|--------|---------|-------------|
| `dataDir` | `config.dataDir` | `~/.kenobot/data` | Base directory for audit trail |
| Audit trail | Automatic | Enabled when `dataDir` exists | JSONL signal logging |
| Middleware | Registered in `app.js` | trace + logging + dead-signal | Pipeline of interceptors |

No environment variables are needed — the Nervous System inherits `dataDir` from the existing config.

---

## Advanced Topics

### Extending with Custom Signals

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

### Signal Inhibition

Middleware can block signals from reaching listeners:

```javascript
bus.use((signal) => {
  if (signal.type === 'message:in' && isBanned(signal.payload.userId)) {
    logger.warn('nervous', 'inhibited', { reason: 'banned user' })
    return false  // signal never reaches AgentLoop
  }
})
```

### Trace Reconstruction

Use the audit trail to reconstruct the full path of a request:

```javascript
const trail = bus.getAuditTrail()

// Find what happened for a specific message
const events = await trail.query({ traceId: 'abc-123' })
// → message:in → config:changed → message:out
```

### Statistics

Monitor signal throughput:

```javascript
const stats = bus.getStats()
// {
//   fired: 142,
//   inhibited: 3,
//   byType: { 'message:in': 42, 'message:out': 42, 'thinking:start': 55, ... }
// }
```

### Relationship to Cognitive System

The Nervous System and Cognitive System are complementary bounded contexts:

| | Nervous System | Cognitive System |
|---|---|---|
| **Metaphor** | Signal transmission | Thought and memory |
| **Concern** | How components communicate | What the bot knows and remembers |
| **API** | `bus.fire()`, `bus.on()` | `cognitive.recall()`, `cognitive.store()` |
| **Persistence** | JSONL audit trail (signals) | Markdown files (memories) |
| **Pattern** | EIP / Observer | Cognitive psychology models |
| **Location** | `src/nervous/` | `src/cognitive/` |
