# Tools

> Actions the bot can take: fetch URLs, trigger workflows, schedule tasks. Works via LLM tool_use or slash commands.

## Overview

Tools let the agent interact with the outside world. Each tool provides:
- A **definition** (name, description, input schema) for the LLM
- An **execute** method that performs the action
- An optional **trigger** regex for slash command invocation

Tools work in two ways:
1. **LLM tool_use** (claude-api): The model decides to use a tool based on its definition
2. **Slash commands** (any provider): User types `/fetch https://example.com` to invoke directly

## Built-in Tools

### web_fetch

Fetch a URL and return its text content. HTML is stripped, output capped at 10KB.

```
/fetch https://example.com
```

Or via LLM: the agent decides to use `web_fetch` when it needs to read a URL.

- 15-second timeout
- Follows redirects
- Strips `<script>` and `<style>` tags
- JSON responses returned as-is (truncated to 10KB)

### n8n_trigger

Trigger an n8n workflow via webhook.

```
/n8n daily-summary
/n8n send-email {"to": "user@example.com", "subject": "Test"}
```

Requires `N8N_WEBHOOK_BASE` to be configured. Sends POST to `{N8N_WEBHOOK_BASE}/{workflow}` with optional JSON data.

- 30-second timeout
- Returns workflow response or success message

### schedule

Create, list, and remove cron-based scheduled tasks.

```
/schedule add "0 9 * * *" Check your calendar
/schedule list
/schedule remove a1b2c3d4
```

See [Scheduler](scheduler.md) for details.

## Tool Execution Loop

When using `claude-api`, the agent can call tools autonomously:

1. LLM response includes `toolCalls` (e.g., "I need to fetch this URL")
2. Agent executes all tool calls in parallel
3. Results are fed back to the LLM as `tool_result` messages
4. LLM generates a new response (may include more tool calls)
5. Loop continues until no more tool calls or **max iterations** reached (default: 20)

```bash
MAX_TOOL_ITERATIONS=20  # Safety valve, configurable in .env
```

If the agent is still requesting tools after 20 iterations, it stops with: "I'm having trouble completing this task."

## Creating a Custom Tool

1. Create `src/tools/my-tool.js`:

```javascript
import BaseTool from './base.js'

export default class MyTool extends BaseTool {
  get definition() {
    return {
      name: 'my_tool',
      description: 'What this tool does (shown to LLM)',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' }
        },
        required: ['query']
      }
    }
  }

  // Optional: slash command trigger
  get trigger() {
    return /^\/mytool\s+(.+)/i
  }

  parseTrigger(match) {
    return { query: match[1] }
  }

  async execute({ query }) {
    // Do something
    return `Result for: ${query}`
  }
}
```

2. Register in `src/index.js`:

```javascript
import MyTool from './tools/my-tool.js'
toolRegistry.register(new MyTool())
```

3. The tool is now available to the LLM (via definition) and to users (via slash command).

## Source

- [src/tools/base.js](../src/tools/base.js) — Interface
- [src/tools/registry.js](../src/tools/registry.js) — Registration and trigger matching
- [src/tools/web-fetch.js](../src/tools/web-fetch.js) — URL fetching
- [src/tools/n8n.js](../src/tools/n8n.js) — n8n webhook trigger
- [src/tools/schedule.js](../src/tools/schedule.js) — Cron scheduling
- [test/tools/](../test/tools/) — Tests
