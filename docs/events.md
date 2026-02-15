# Signal Schema

KenoBot uses an event-driven architecture powered by the **Nervous System** (`src/domain/nervous/`). Components communicate through typed signals with automatic tracing, middleware, and audit capabilities.

The Nervous System extends Node.js `EventEmitter` — all existing `bus.on()` patterns work unchanged. The primary API for producers is `bus.fire()`, which wraps events in a Signal envelope before delivery.

## Signal Envelope

Every signal fired through the Nervous System carries metadata:

```javascript
{
  type: 'message:in',              // Signal type constant
  payload: { text, chatId, ... },  // Raw event data (received by listeners)
  source: 'telegram',              // Component that fired the signal
  traceId: 'uuid-...',            // Correlation ID (auto-generated or propagated)
  timestamp: 1707900000000         // When the signal was created
}
```

Listeners receive only the `payload`. The full Signal is visible to middleware and the audit trail.

## Signal Naming Convention

Signals follow a `category:action` pattern (e.g., `message:in`, `health:degraded`).

## Core Signals

### Message Flow

#### `message:in`

**Fired by:** Channels (Telegram, HTTP), Scheduler
**Consumed by:** AgentLoop

User message received from a channel.

```typescript
{
  text: string,        // Message content
  chatId: number,      // Chat/conversation ID
  userId: number,      // User ID
  channel: string,     // Source channel ('telegram', 'http')
  timestamp: number    // Unix timestamp (ms)
}
```

---

#### `message:out`

**Fired by:** AgentLoop
**Consumed by:** Channels (Telegram, HTTP)

Bot response ready to send to user.

```typescript
{
  text: string,      // Response content
  chatId: number,    // Target chat/conversation
  channel: string    // Target channel ('telegram', 'http')
}
```

---

#### `thinking:start`

**Fired by:** AgentLoop (via TypingIndicator)
**Consumed by:** Telegram Channel

Indicates the bot is processing a request (shows "typing..." indicator).

```typescript
{
  chatId: number,    // Target chat
  channel: string    // Target channel
}
```

**Behavior:** Fired once when processing starts, then periodically every 4 seconds until response is sent.

**Audit:** Excluded from audit trail by default (noisy).

---

### Error Handling

#### `error`

**Fired by:** Any component
**Consumed by:** App (central error handler)

An error occurred during processing.

```typescript
{
  source: string,     // Component that fired ('telegram', 'agent', 'provider', etc.)
  error: Error,       // Error object
  context?: object    // Optional additional context
}
```

---

### Health Monitoring

#### `health:degraded`

**Fired by:** Watchdog
**Consumed by:** Notification system

System health is degraded but still functional.

```typescript
{
  previous: string,   // Previous state ('healthy')
  detail: string      // Description of degradation
}
```

---

#### `health:unhealthy`

**Fired by:** Watchdog
**Consumed by:** Notification system

System is unhealthy and may not function correctly.

```typescript
{
  previous: string,   // Previous state ('degraded', 'healthy')
  detail: string      // Description of issue
}
```

---

#### `health:recovered`

**Fired by:** Watchdog
**Consumed by:** Notification system

System has recovered from unhealthy/degraded state.

```typescript
{
  previous: string,   // Previous state ('unhealthy', 'degraded')
  detail: string      // Description of recovery
}
```

---

### Configuration

#### `config:changed`

**Fired by:** Post-processors (memory, preferences updates)
**Consumed by:** Audit trail (logged automatically)

Configuration or memory files have changed.

```typescript
{
  reason: string      // Why config changed ('memory update', 'user preferences update', etc.)
}
```

---

### Notifications

#### `notification`

**Fired by:** Notification system
**Consumed by:** Telegram Channel (owner notifications)

Send a notification to the bot owner.

```typescript
{
  chatId: number,     // Owner's chat ID
  text: string        // Notification message
}
```

**Use cases:** Health alerts, system events.

---

## Signal Flow Diagrams

### Message Processing Flow

```
User → Telegram/HTTP
         ↓
     [message:in]  ← middleware (trace, log, audit)
         ↓
      AgentLoop
         ↓
     [thinking:start] (periodic)
         ↓
      Provider (Claude/Gemini)
         ↓
      AgentLoop
         ↓
     [message:out]  ← middleware (trace propagation links to original message:in)
         ↓
    Telegram/HTTP → User
```

### Error Flow

```
Any Component
     ↓
  [error]  ← middleware (logged, audited)
     ↓
  App (logger)
     ↓
 [message:out] (user-facing error)
```

---

## Middleware

Middleware functions intercept every signal before delivery. Registered via `bus.use(fn)` in the composition root (`src/app.js`).

Built-in middleware:
- **Trace propagation**: Links `message:in` → `message:out` via shared traceId per chatId
- **Logging**: Logs all signals through the structured logger (skips `thinking:start`)
- **Dead signal detection**: Warns when a signal has zero listeners

Custom middleware signature:
```javascript
// Return void to allow delivery, return false to inhibit (block)
bus.use((signal) => {
  if (signal.type === 'message:in' && signal.payload.text.includes('spam')) {
    return false  // Inhibit delivery
  }
})
```

---

## Audit Trail

All signals (except excluded types) are logged to JSONL files:

```
{dataDir}/nervous/signals/YYYY-MM-DD.jsonl
```

One JSON line per signal. Queryable via `bus.getAuditTrail().query({ type, traceId, since, limit })`.

---

## Extending with Custom Signals

1. Define constants in `src/infrastructure/events.js` (or `src/domain/nervous/signals.js`):
   ```javascript
   export const MY_EVENT = 'my:event'
   ```

2. Document payload shape in this file

3. Fire with `bus.fire(MY_EVENT, payload, { source: 'my-component' })`

4. Subscribe with `bus.on(MY_EVENT, handler)`

**Best practices:**
- Use `category:action` naming
- Document payload structure
- Keep payloads minimal and focused
- Always provide a `source` when firing signals
