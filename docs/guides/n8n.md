# n8n Integration

> Connect KenoBot to external services through n8n workflow automation.

## What is n8n?

[n8n](https://n8n.io) is a workflow automation tool — think Zapier but self-hosted and free. It connects to hundreds of services: Google Calendar, Gmail, Slack, GitHub, databases, APIs, etc.

## Why does KenoBot need n8n?

KenoBot is a conversational AI — it's great at understanding requests and generating responses, but it can't directly access your Google Calendar, send emails, or query databases. n8n fills that gap.

Think of it as KenoBot's nervous system:

```
You: "What's on my calendar today?"
  → KenoBot triggers n8n workflow "calendar-check"
    → n8n fetches your Google Calendar
    → n8n sends results back to KenoBot
  → KenoBot formats and responds: "You have 3 meetings today..."
```

Without n8n, KenoBot can only answer questions from its own knowledge. With n8n, it can act on the real world.

## When do you need it?

You need n8n when you want KenoBot to:
- Check or manage your calendar
- Send and read emails
- Trigger home automation
- Query external APIs or databases
- Run any multi-step automation

If you only need KenoBot for conversation, you **don't** need n8n.

## Install n8n

The fastest way is Docker (on the same machine as KenoBot):

```bash
docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

n8n will be available at `http://localhost:5678`. Create your admin account on first visit.

## Connect to KenoBot

### 1. Generate an n8n API key

In n8n web UI: Settings > API > Create API Key.

### 2. Configure KenoBot

```bash
kenobot config edit
```

Add these variables:

```bash
# n8n webhook URL (for triggering workflows)
N8N_WEBHOOK_BASE=http://localhost:5678/webhook

# n8n REST API (for managing workflows)
N8N_API_URL=http://localhost:5678
N8N_API_KEY=your_api_key_here
```

### 3. Verify

```bash
kenobot doctor
```

Should show: `[✓] n8n (reachable at localhost:5678)`

## How it works

### KenoBot triggers n8n (outbound)

KenoBot can trigger any n8n workflow that has a Webhook trigger node:

```
# Via slash command
/n8n daily-summary
/n8n send-email {"to":"user@example.com","subject":"Hello"}

# Via natural language (claude-api provider with tool_use)
You: "Check my calendar for tomorrow"
Bot: (automatically calls n8n_trigger workflow="calendar-check")
```

### n8n calls KenoBot back (inbound)

n8n can send results back to KenoBot via the HTTP webhook channel. This requires:

1. HTTP channel enabled in KenoBot:
   ```bash
   HTTP_ENABLED=true
   HTTP_PORT=3000
   WEBHOOK_SECRET=your_secret_here  # openssl rand -hex 32
   ```

2. An HTTP Request node in your n8n workflow pointing to `http://localhost:3000/webhook` with HMAC signature.

If both KenoBot and n8n are on the same machine, `localhost` works perfectly — no tunnel needed.

### Example: full round-trip

```
1. You in Telegram: "Check my calendar"
2. KenoBot → POST http://localhost:5678/webhook/calendar-check
3. n8n fetches Google Calendar via OAuth
4. n8n → POST http://localhost:3000/webhook (with results)
5. KenoBot formats response
6. You receive: "You have 3 meetings today: ..."
```

## Managing workflows

KenoBot can also manage n8n workflows directly:

```
/n8n-manage list                  # List all workflows
/n8n-manage get 5                 # Get workflow details
/n8n-manage activate 5            # Activate a workflow
/n8n-manage deactivate 5          # Deactivate a workflow
```

## n8n on a different machine?

If n8n runs on a different server (or n8n Cloud), KenoBot → n8n works out of the box (just set the remote URL in `N8N_WEBHOOK_BASE`). But n8n → KenoBot needs KenoBot to be reachable from the internet. See the [cloudflared guide](cloudflared.md) for that.

## Further reading

- [n8n feature docs](../features/n8n.md) — HMAC signing, session modes, tool definitions
- [Integrations guide](../integrations-guide.md) — Complete env var reference
