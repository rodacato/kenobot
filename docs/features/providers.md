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
# .env
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

## Switching Providers

Change `PROVIDER` in `.env` and restart:

```bash
# Switch from CLI to API
PROVIDER=claude-api
ANTHROPIC_API_KEY=sk-ant-api03-...
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

3. Set `PROVIDER=my-provider` in `.env`.

## Source

- [src/providers/base.js](../src/providers/base.js) — Interface
- [src/providers/claude-api.js](../src/providers/claude-api.js) — Anthropic SDK
- [src/providers/claude-cli.js](../src/providers/claude-cli.js) — CLI wrapper
- [src/providers/mock.js](../src/providers/mock.js) — Test provider
- [test/providers/](../test/providers/) — Tests
