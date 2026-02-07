# Channels

> I/O adapters that connect KenoBot to messaging platforms. Telegram and HTTP webhooks are built in.

## Overview

Channels receive user messages and send bot responses. Each channel implements `BaseChannel` which provides deny-by-default authentication and bus wiring via the Template Method pattern.

## Available Channels

| Channel | Enabled By | Auth Method |
|---------|-----------|-------------|
| Telegram | Always (requires `TELEGRAM_BOT_TOKEN`) | Chat ID allowlist |
| HTTP | `HTTP_ENABLED=true` | HMAC-SHA256 signature |

## Telegram

Primary channel using the [grammy](https://grammy.dev) library.

### Configuration

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321
```

### Features

- **Deny-by-default auth**: Only chat IDs in the allowlist can interact
- **Markdown-to-HTML formatting**: Converts LLM markdown output to Telegram-compatible HTML
- **Message chunking**: Splits responses longer than 4000 characters into multiple messages
- **Typing indicator**: Shows "typing..." while the LLM is processing
- **Per-chat sessions**: Each chat ID gets its own conversation history

### Getting Your Chat ID

1. Start a conversation with [@userinfobot](https://t.me/userinfobot)
2. It replies with your user ID — use this as your chat ID
3. For group chats, add the bot and check the logs for the group's chat ID

## HTTP Webhook

Receives external requests via HTTP POST with HMAC validation. Designed for n8n integration and other automation tools.

### Configuration

```bash
HTTP_ENABLED=true
HTTP_PORT=3000
HTTP_HOST=127.0.0.1
WEBHOOK_SECRET=your-secret-here  # openssl rand -hex 32
HTTP_TIMEOUT=60000
```

### Endpoints

**POST /webhook** — Send a message, get a response.

```bash
# Generate signature
BODY='{"message":"Hello KenoBot"}'
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | awk '{print $2}')"

# Send request
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIG" \
  -d "$BODY"
```

Request body:
```json
{
  "message": "What's the weather?",
  "chat_id": "optional-session-id"
}
```

- With `chat_id`: Maintains conversation history across requests (session: `http-{chat_id}`)
- Without `chat_id`: Each request is standalone (transient session)

Response:
```json
{
  "response": "The weather is...",
  "status": "ok"
}
```

**GET /health** — Health check endpoint.

```bash
curl http://localhost:3000/health
```

Returns:
```json
{
  "status": "ok",
  "pid": 12345,
  "uptime": 3600,
  "memory": {"rss": 45, "heap": 20},
  "timestamp": 1707307200000
}
```

## Adding a New Channel

1. Create `src/channels/my-channel.js`:

```javascript
import BaseChannel from './base.js'

export default class MyChannel extends BaseChannel {
  get name() { return 'my-channel' }

  async start() {
    // Set up your messaging client
    // When a message arrives:
    this._publishMessage({
      text: messageText,
      chatId: chatId,
      userId: senderId,
      timestamp: Date.now()
    })
    // _publishMessage() handles auth check + bus emit

    // Listen for responses
    this.bus.on('message:out', ({ chatId, text, channel }) => {
      if (channel !== this.name) return
      // Send text back to the user
    })
  }

  async stop() {
    // Cleanup
  }

  async send(chatId, text, options = {}) {
    // Send a message to a specific chat
  }
}
```

2. Register in `src/index.js`:

```javascript
const myChannel = new MyChannel(bus, { allowFrom: ['user-id-1'] })
channels.push(myChannel)
```

The `_publishMessage()` and `_isAllowed()` methods are inherited — you get deny-by-default auth for free.

## Source

- [src/channels/base.js](../src/channels/base.js) — Interface with auth logic
- [src/channels/telegram.js](../src/channels/telegram.js) — Telegram adapter
- [src/channels/http.js](../src/channels/http.js) — HTTP webhook channel
- [test/channels/](../test/channels/) — Tests
