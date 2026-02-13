# Event Bus Schema

KenoBot uses an event-driven architecture based on Node.js EventEmitter. Components communicate through the central message bus, enabling loose coupling and extensibility.

## Event Naming Convention

Events follow a `category:action` pattern (e.g., `message:in`, `health:degraded`).

## Core Events

### Message Flow

#### `message:in`

**Emitted by:** Channels (Telegram, HTTP)
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

**Example:**
```javascript
bus.emit('message:in', {
  text: 'Hello bot!',
  chatId: 123456789,
  userId: 123456789,
  channel: 'telegram',
  timestamp: Date.now()
})
```

---

#### `message:out`

**Emitted by:** AgentLoop
**Consumed by:** Channels (Telegram, HTTP)

Bot response ready to send to user.

```typescript
{
  text: string,      // Response content
  chatId: number,    // Target chat/conversation
  channel: string    // Target channel ('telegram', 'http')
}
```

**Example:**
```javascript
bus.emit('message:out', {
  text: 'Hello! How can I help you?',
  chatId: 123456789,
  channel: 'telegram'
})
```

---

#### `thinking:start`

**Emitted by:** AgentLoop (via TypingIndicator)
**Consumed by:** Telegram Channel

Indicates the bot is processing a request (shows "typing..." indicator).

```typescript
{
  chatId: number,    // Target chat
  channel: string    // Target channel
}
```

**Behavior:** Emitted once when processing starts, then periodically every 5 seconds until response is sent.

---

### Error Handling

#### `error`

**Emitted by:** Any component
**Consumed by:** App (central error handler)

An error occurred during processing.

```typescript
{
  source: string,     // Component that emitted ('telegram', 'agent', 'provider', etc.)
  error: Error,       // Error object
  context?: object    // Optional additional context
}
```

**Example:**
```javascript
bus.emit('error', {
  source: 'telegram',
  error: new Error('API rate limit exceeded')
})
```

---

### Health Monitoring

#### `health:degraded`

**Emitted by:** Watchdog
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

**Emitted by:** Watchdog
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

**Emitted by:** Watchdog
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

**Emitted by:** Post-processors (memory, preferences updates)
**Consumed by:** ConfigSync

Configuration files have changed and need to be backed up.

```typescript
{
  reason: string      // Why config changed ('memory update', 'user preferences update', etc.)
}
```

**Triggers:** Automatic git commit + push of config changes.

---

### Approval System

#### `approval:proposed`

**Emitted by:** ApprovalManager
**Consumed by:** Notification system

A new approval request has been created.

```typescript
{
  id: string,         // Approval ID
  type: string,       // Approval type
  name: string        // Human-readable name
}
```

---

#### `approval:approved`

**Emitted by:** ApprovalManager
**Consumed by:** ConfigSync, tools

An approval request was approved by the user.

```typescript
{
  id: string,         // Approval ID
  type: string,       // Approval type
  data: object        // Approval payload
}
```

---

#### `approval:rejected`

**Emitted by:** ApprovalManager
**Consumed by:** Tools

An approval request was rejected by the user.

```typescript
{
  id: string,         // Approval ID
  type: string        // Approval type
}
```

---

### Notifications

#### `notification`

**Emitted by:** Any component
**Consumed by:** Telegram Channel (owner notifications)

Send a notification to the bot owner.

```typescript
{
  chatId: number,     // Owner's chat ID
  text: string        // Notification message
}
```

**Use cases:** Health alerts, approval requests, system events.

---

## Event Flow Diagrams

### Message Processing Flow

```
User → Telegram/HTTP
         ↓
     [message:in]
         ↓
      AgentLoop
         ↓
     [thinking:start] (periodic)
         ↓
      Provider (Claude/Gemini)
         ↓
      AgentLoop
         ↓
     [message:out]
         ↓
    Telegram/HTTP → User
```

### Error Flow

```
Any Component
     ↓
  [error]
     ↓
  App (logger)
     ↓
 [message:out] (user-facing error)
```

### Config Change Flow

```
Post-processor
     ↓
 [config:changed]
     ↓
  ConfigSync
     ↓
 Git commit + push
```

---

## Versioning Strategy

**Additive only:** New fields can be added to payloads, but existing fields must not be changed or removed without a major version bump.

**Example:**
```javascript
// ✅ ALLOWED: Adding optional field
{ text, chatId, channel, metadata: {...} }  // metadata is new

// ❌ BREAKING: Removing or renaming field
{ message, chatId, channel }  // 'text' renamed to 'message'
```

---

## Extending with Custom Events

To add custom events:

1. Define constants in `src/events.js`:
   ```javascript
   export const MY_EVENT = 'my:event'
   ```

2. Document payload shape in this file

3. Emit with `bus.emit(MY_EVENT, payload)`

4. Subscribe with `bus.on(MY_EVENT, handler)`

**Best practices:**
- Use `category:action` naming
- Document payload structure
- Keep payloads minimal and focused
- Use TypeScript-style JSDoc for autocomplete
