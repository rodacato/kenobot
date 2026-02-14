# Nervous System

> The signaling backbone of KenoBot — how the brain communicates with the body.

**Date**: 2026-02-14
**Status**: Implemented

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| Gregor Hohpe | Enterprise integration | *Enterprise Integration Patterns* (2003) | Validated Signal as Message pattern, middleware as Pipes & Filters, audit as Wire Tap |
| Eric Evans | Domain modeling | *Domain-Driven Design* (2003) | Validated nervous system as bounded context, Signal as domain event |
| Greg Young | Event sourcing | CQRS and Event Sourcing | Validated JSONL audit trail as lightweight event store |
| Joe Armstrong | Concurrent systems | *Programming Erlang* (2007), Erlang/OTP | Validated components-as-actors pattern, message passing via bus |

## Context

KenoBot already has a **brain** — the Cognitive System (`src/cognitive/`) with 4 memory types, identity management, and retrieval. But the brain communicates with the body through a 27-line dumb pipe (`src/bus.js`): a bare `EventEmitter` with no awareness of what flows through it.

When a message arrives from Telegram, traverses the agent loop, generates a response, and flows back — nobody records what happened. There's no trace of the signal's path. No audit trail. No way to intercept, filter, or transform signals globally. Debugging means reading scattered logs and hoping you find the right one.

The bus is infrastructure that deserves to be architecture.

## The Metaphor

The nervous system is how biological organisms communicate internally. It maps naturally to KenoBot's existing architecture:

| Nervous System | KenoBot Component | Status |
|---|---|---|
| **Sensory neurons** (afferent) | Channels — receive input from the world | Done |
| **Motor neurons** (efferent) | Channels — send output to the world | Done |
| **Spinal cord** (signal routing) | NervousSystem — routes signals between components | Done |
| **Brain** (processing) | AgentLoop + Cognitive System | Done |
| **Reflex arc** (automatic, no brain) | TypingIndicator — fires without agent processing | Done |
| **Autonomic system** (unconscious) | Watchdog, Scheduler — operate without user intervention | Done |
| **Pain signals** | Error events, Health events | Done |
| **Memory formation** | Cognitive System — already a bounded context | Done |
| **Neurotransmitters** | Signal payloads — the data that travels | Done |
| **Synapses** (connection points) | Listeners — where signals connect to handlers | Done |
| **Myelin sheath** (protection/speed) | Middleware — protects and enriches signals in transit | Done |
| **Neural trace** (signal path record) | Audit trail — JSONL record of all signals | Done |
| **Inhibition** (block signals) | Middleware can return `false` to block delivery | Done |
| **Correlation** (connected signals) | TraceId linking request → response | Done |

### How It All Fits Together

```
                         ┌──────────────────────┐
                         │   Brain               │
                         │   (AgentLoop +         │
                         │    Cognitive System)   │
                         └───────────┬───────────┘
                                     │
  ┌──────────────┐    ┌──────────────┴──────────────┐    ┌──────────────┐
  │  Sensory      │───→│     Nervous System            │───→│  Motor        │
  │  Neurons      │    │  ┌─────────────────────────┐  │    │  Neurons      │
  │  (Channels    │    │  │ Spinal Cord (bus)        │  │    │  (Channels    │
  │   .receive)   │    │  │  + Myelin (middleware)   │  │    │   .send)      │
  │               │    │  │  + Neural Trace (audit)  │  │    │               │
  └──────────────┘    │  └─────────────────────────┘  │    └──────────────┘
                       │                               │
                       │  Reflex Arc                   │
                       │  (TypingIndicator: no brain)  │
                       │                               │
                       │  Autonomic System              │
                       │  (Watchdog + Scheduler:        │
                       │   unconscious monitoring)      │
                       │                               │
                       │  Pain Signals                  │
                       │  (error, health:*)             │
                       └───────────────────────────────┘
```

**What doesn't need to change:** The Watchdog and Scheduler already behave as autonomic functions — they operate independently, monitor vital signs, and fire health/pain signals through the Nervous System. They don't need to be reorganized or renamed. The metaphor describes what they already do.

**Future extensions** (not planned, but the metaphor supports them):
- **Synaptic plasticity** — Middleware that adapts based on signal history (e.g., rate limiting that learns normal patterns)
- **Nerve clusters/ganglia** — Local signal processing before reaching the brain (e.g., channel-level preprocessing)
- **Sensory gating** — Filtering irrelevant stimuli before they reach the brain (e.g., spam detection middleware)

## What Was Built

A `src/nervous/` bounded context — same pattern as `src/cognitive/`:

```
src/nervous/
  index.js          — NervousSystem facade (extends EventEmitter)
  signal.js         — Signal class (typed event + metadata)
  signals.js        — Signal type definitions
  middleware.js     — Built-in middleware (trace, logging, dead-signal)
  audit-trail.js   — JSONL signal persistence
```

### Signal

A typed envelope wrapping existing event payloads:

```javascript
class Signal {
  constructor(type, payload, { source, traceId } = {}) {
    this.type = type           // 'message:in', etc.
    this.payload = payload     // raw data (unchanged from today)
    this.source = source || 'unknown'
    this.traceId = traceId || crypto.randomUUID()
    this.timestamp = Date.now()
  }
}
```

Listeners still receive raw payloads — zero consumer changes needed.

### NervousSystem

```javascript
class NervousSystem extends EventEmitter {
  fire(type, payload, { source, traceId } = {})  // Signal-aware emit
  use(middleware)                                   // Register middleware
  getAuditTrail()                                  // Access audit sub-system
}
```

`fire()` creates a Signal, runs middleware, logs to audit trail, then calls `super.emit(type, payload)`. Existing `bus.on()` listeners work unchanged.

### Middleware Pipeline

```javascript
// Middleware signature: (signal) => void | false
// Return false to inhibit (stop delivery)
nervous.use((signal) => {
  logger.debug('nervous', signal.type, { source: signal.source, traceId: signal.traceId })
})
```

Built-in middleware (registered in `app.js`):
1. **Trace propagation**: Links MESSAGE_IN → MESSAGE_OUT via shared traceId per chatId
2. **Logging**: Logs all signals through the structured logger (skips THINKING_START)
3. **Dead signal detection**: Warns when a signal fires with zero listeners

### Audit Trail

JSONL persistence to `{dataDir}/nervous/signals/YYYY-MM-DD.jsonl` — one line per signal. Same pattern as sessions and memory.

## References

### Enterprise Integration Patterns (EIP)

**Authors**: Gregor Hohpe & Bobby Woolf
**Work**: *Enterprise Integration Patterns* (2003)

| EIP Pattern | Implementation | Chapter |
|---|---|---|
| **Publish-Subscribe Channel** | EventEmitter base | Ch. 3 |
| **Pipes and Filters** | Middleware pipeline | Ch. 8 |
| **Message** | Signal class (envelope + payload) | Ch. 3 |
| **Message History** | AuditTrail (JSONL signal log) | Ch. 10 |
| **Dead Letter Channel** | Dead signal detection middleware | Ch. 4 |
| **Correlation Identifier** | Signal.traceId | Ch. 5 |
| **Wire Tap** | Audit trail middleware | Ch. 10 |

**Key insight**: A message should be an envelope (metadata) containing a payload (data). The old events were raw payloads with no envelope. The Signal class adds the envelope.

### Domain-Driven Design (DDD)

**Authors**: Eric Evans (*DDD*, 2003), Vaughn Vernon (*Implementing DDD*, 2013), Alberto Brandolini (Event Storming)

- **Domain Events**: Signal is a domain event with explicit identity (traceId), timestamp, and source
- **Bounded Context**: The nervous system has its own language (signal, fire, pathway), persistence (audit trail), and interfaces
- **Anti-Corruption Layer**: NervousSystem facade bridges internal Signal model and external EventEmitter API

### Event Sourcing

**Authors**: Greg Young, Martin Fowler

- **Append-only log**: JSONL audit files are immutable once written
- **Temporal query**: `query({ type, since, traceId })` enables time-based investigation

**What we're NOT doing**: Full event sourcing (deriving state from events). The audit trail is for observability, not state reconstruction.

### Actor Model

**Authors**: Carl Hewitt (1973), Joe Armstrong (Erlang/OTP)

- **Message passing**: Components communicate only through bus events, never shared state
- **Location transparency**: Channels don't know about AgentLoop; they just emit/listen
- **Supervision**: Watchdog + health events implement simple supervision

### Reactive Systems

**Source**: The Reactive Manifesto (Jonas Boner et al., 2014)

| Property | Implementation | Status |
|---|---|---|
| **Responsive** | Bot responds within timeout | Exists |
| **Resilient** | CircuitBreaker, Watchdog health checks | Exists |
| **Elastic** | N/A (single instance, personal bot) | Not needed |
| **Message-Driven** | Event bus, async communication | Exists |

Middleware inhibition (`return false`) is a primitive form of backpressure.

### Design Decision Validation

| Decision | Validated By |
|---|---|
| Signal as envelope + payload | EIP (Message), DDD (Domain Event) |
| Middleware pipeline | EIP (Pipes and Filters), Reactive (backpressure hook) |
| `fire()` preserving `emit()` compat | DDD (Anti-Corruption Layer) |
| JSONL audit trail | Event Sourcing (append-only log), EIP (Wire Tap) |
| traceId correlation | EIP (Correlation Identifier) |
| Dead signal detection | EIP (Dead Letter Channel) |
| Bounded context module | DDD (Bounded Context) |
| Nervous system naming | Neuroscience (consistent with cognitive system metaphor) |

### Further Reading

- Hohpe & Woolf, *Enterprise Integration Patterns* (2003) — Chapters 3, 5, 7, 8, 10
- Evans, *Domain-Driven Design* (2003) — Domain Events and Bounded Contexts
- Vernon, *Implementing Domain-Driven Design* (2013)
- Young, "CQRS and Event Sourcing" talks and blog posts
- Fowler, "Event Sourcing" (martinfowler.com)
- Armstrong, *Programming Erlang* (2007)
- The Reactive Manifesto (reactivemanifesto.org)
- Brandolini, *Introducing EventStorming* (2021)
