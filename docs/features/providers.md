# Providers

> Swappable LLM backends. Change one env var to switch between Claude API, Claude CLI, or a mock provider.

## Overview

Providers implement the `BaseProvider` interface: `chat(messages, options)` returns a response. The agent loop doesn't know which provider it's using — you can switch without touching any code.

## Available Providers

| Provider | `PROVIDER=` | Speed | Cost | Tool Calling |
|----------|-------------|-------|------|-------------|
| Claude API | `claude-api` | ~3s | Per-token (Anthropic billing) | Native `tool_use` |
| Claude CLI | `claude-cli` | ~20s | CLI subscription | Slash commands only |
| Mock | `mock` | Instant | Free | No |

## Configuration

```bash
# ~/.kenobot/config/.env (or .env in project root for development)
PROVIDER=claude-api    # or claude-cli, mock
MODEL=sonnet           # sonnet, opus, haiku
ANTHROPIC_API_KEY=sk-ant-api03-...  # Required for claude-api
```

## claude-api

Uses the `@anthropic-ai/sdk` package to call the Anthropic Messages API directly.

- Fastest response times (~3s for sonnet)
- Supports native tool_use (tools defined via `input_schema`)
- Requires `ANTHROPIC_API_KEY`
- Billed per-token through your Anthropic account

## claude-cli

Wraps the official [Claude Code CLI](https://claude.ai/download) as a subprocess.

- Uses your existing CLI subscription
- No API key needed — CLI handles its own auth
- Slower (~20s per response with sonnet)
- No native tool_use support — tools work via slash command triggers instead
- Uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` to avoid stdin hanging

**Required CLI flags** (set automatically by the provider):
```
--dangerously-skip-permissions
--disable-slash-commands
--no-chrome
--no-session-persistence
--permission-mode bypassPermissions
--model MODEL
-p PROMPT
```

## mock

Deterministic provider for testing. Returns canned responses based on pattern matching:

- Messages containing "hello" → "Hello there! General Kenobi..."
- Messages containing "error" → Throws an error
- Everything else → Generic response with message metadata

Use for development and automated tests without burning API credits.

## Cost Estimates

Approximate cost per typical message (500 input tokens, 300 output tokens):

| Model | Input | Output | ~Cost/message | ~Cost/day (50 msgs) |
|-------|-------|--------|---------------|---------------------|
| Haiku | $1/MTok | $5/MTok | $0.002 | $0.10 |
| Sonnet | $3/MTok | $15/MTok | $0.006 | $0.30 |
| Opus | $15/MTok | $75/MTok | $0.030 | $1.50 |

**Notes:**
- Actual costs vary with message length and context size (memory, history, skills all add input tokens)
- Scheduled tasks count as additional LLM calls — a daily cron task adds ~$0.006/day with Sonnet
- Tool loops multiply costs: each iteration is a separate provider call
- `claude-cli` uses your CLI subscription (no per-token billing)
- `mock` is free

## Retry Behavior

All providers automatically retry on transient HTTP errors with exponential backoff:

- **Retryable errors**: 429 (rate limit), 500, 502, 503
- **Backoff delays**: 1s, 2s, 4s
- **Max attempts**: 3 (1 initial + 2 retries)
- **Non-retryable errors** (400, 401, etc.) are thrown immediately

This applies to `claude-api` errors. The `claude-cli` provider's subprocess errors don't carry HTTP status codes and are not retried.

## Switching Providers

Change `PROVIDER` in your config and restart:

```bash
kenobot config edit    # Change PROVIDER and add API key if needed
kenobot restart        # Restart to apply changes
```

The agent loop, context builder, channels, and tools all work identically regardless of provider.

## Adding a Custom Provider

1. Create `src/providers/my-provider.js`:

```javascript
import BaseProvider from './base.js'

export default class MyProvider extends BaseProvider {
  async chat(messages, options = {}) {
    // Call your LLM
    // Return: { content: string, toolCalls: array|null, stopReason: string, rawContent: array|null }
  }

  get name() { return 'my-provider' }
}
```

2. Add a case in `src/index.js`:

```javascript
case 'my-provider':
  provider = new MyProvider(config)
  break
```

3. Set `PROVIDER=my-provider` in your config (`kenobot config edit`).

## Source

- [src/providers/base.js](../src/providers/base.js) — Interface
- [src/providers/claude-api.js](../src/providers/claude-api.js) — Anthropic SDK
- [src/providers/claude-cli.js](../src/providers/claude-cli.js) — CLI wrapper
- [src/providers/mock.js](../src/providers/mock.js) — Test provider
- [test/providers/](../test/providers/) — Tests
