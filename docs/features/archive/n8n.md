# n8n Integration

> Bidirectional communication between KenoBot (brain) and n8n (nervous system). The bot triggers workflows, and workflows call the bot.

## Overview

KenoBot integrates with [n8n](https://n8n.io) in two directions:

- **KenoBot → n8n**: The bot triggers workflows via the `n8n_trigger` tool
- **n8n → KenoBot**: Workflows send messages via the HTTP webhook channel

```
KenoBot (brain)  ←→  n8n (nervous system)
   ↓ triggers           ↓ calls back
   workflows        webhook endpoint
```

## KenoBot → n8n

### Configuration

```bash
N8N_WEBHOOK_BASE=https://n8n.example.com/webhook
```

When set, the `n8n_trigger` tool is automatically registered.

### Usage

Via slash command:

```
/n8n daily-summary
/n8n send-email {"to":"user@example.com","subject":"Hello"}
```

Via LLM tool_use (claude-api):

```
User: Check my calendar and send me a summary
Bot: (calls n8n_trigger with workflow="calendar-summary")
     Here's your calendar for today: ...
```

The tool sends a POST request to `{N8N_WEBHOOK_BASE}/{workflow}` with the optional data payload.

### n8n Workflow Setup

1. Create a new workflow in n8n
2. Add a **Webhook** trigger node
3. Set the webhook path (e.g., `daily-summary`)
4. Add your automation nodes (Google Calendar, Gmail, etc.)
5. The webhook URL will be: `https://n8n.example.com/webhook/daily-summary`

## n8n → KenoBot

### Configuration

Enable the HTTP webhook channel:

```bash
HTTP_ENABLED=true
HTTP_PORT=3000
HTTP_HOST=127.0.0.1
WEBHOOK_SECRET=your-secret-here  # openssl rand -hex 32
```

### n8n Workflow Setup

Add an **HTTP Request** node in your n8n workflow:

- **Method**: POST
- **URL**: `http://localhost:3000/webhook` (or your KenoBot host)
- **Headers**: `X-Webhook-Signature: sha256=<hmac>`
- **Body**:
  ```json
  {
    "message": "I found 3 calendar events for today. Should I summarize them?",
    "chat_id": "my-workflow"
  }
  ```

### HMAC Signature

n8n must sign the request body with HMAC-SHA256:

```
signature = "sha256=" + HMAC-SHA256(body, WEBHOOK_SECRET)
```

In n8n, use a **Code** node before the HTTP request:

```javascript
const crypto = require('crypto');
const body = JSON.stringify($input.first().json);
const signature = 'sha256=' + crypto
  .createHmac('sha256', 'your-webhook-secret')
  .update(body)
  .digest('hex');

return [{ json: { body, signature } }];
```

### Session Modes

- **With `chat_id`**: Maintains conversation history (session: `http-{chat_id}`)
- **Without `chat_id`**: Each request is standalone, no history

## Bidirectional Example

A complete round-trip:

1. User in Telegram: "Check my calendar"
2. KenoBot triggers n8n: `POST /webhook/calendar-check`
3. n8n fetches Google Calendar data
4. n8n calls KenoBot back: `POST /webhook` with calendar events
5. KenoBot processes and summarizes
6. Response sent back to user in Telegram

## Source

- [src/tools/n8n.js](../src/tools/n8n.js) — n8n trigger tool
- [src/channels/http.js](../src/channels/http.js) — HTTP webhook channel
- [test/tools/n8n.test.js](../test/tools/n8n.test.js) — Tests
