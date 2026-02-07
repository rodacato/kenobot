# Tools

> Actions the bot can take: fetch URLs, trigger workflows, manage files, run diagnostics. Works via LLM tool_use or slash commands.

## Overview

Tools let the agent interact with the outside world. Each tool provides:
- A **definition** (name, description, input schema) for the LLM
- An **execute** method that performs the action
- An optional **trigger** regex for slash command invocation

Tools work in two ways:
1. **LLM tool_use** (claude-api): The model decides to use a tool based on its definition
2. **Slash commands** (any provider): User types `/fetch https://example.com` to invoke directly

## Architecture

Tools use **auto-discovery with self-registration**. At startup, `ToolLoader` scans `src/tools/*.js`, imports each file, and calls its exported `register(registry, deps)` function. Each tool decides internally whether to register based on the deps it receives (config, services, etc.).

```
ToolLoader.loadAll()
  → readdir(src/tools/)
  → import each *.js (skip base.js, registry.js, loader.js)
  → call register(registry, deps) if exported
  → call tool.init() lifecycle hook
  → log loaded tools
```

**Lifecycle hooks**: Tools can optionally implement `init()` (async setup after registration) and `stop()` (cleanup during shutdown).

**Dependency injection**: A `deps` object is assembled once in `index.js` and passed to every `register()`:
```js
{ config, scheduler, watchdog, circuitBreaker, bus, skillLoader, identityLoader }
```

## Built-in Tools

### web_fetch

Fetch a URL and return its text content. HTML is stripped, output capped at 10KB.

```
/fetch https://example.com
```

- Always enabled (no config required)
- 15-second timeout, follows redirects
- Strips `<script>` and `<style>` tags
- JSON responses returned as-is (truncated to 10KB)

### schedule

Create, list, and remove cron-based scheduled tasks.

```
/schedule add "0 9 * * *" Check your calendar
/schedule list
/schedule remove a1b2c3d4
```

- Always enabled (uses the `scheduler` service)
- See [Scheduler](scheduler.md) for details

### diagnostics

Get system health status: watchdog state, circuit breaker, memory usage, uptime.

```
/diagnostics
```

- Always enabled (uses `watchdog` and `circuitBreaker` services)
- Returns JSON with all health check results

### workspace

Read, write, list, and delete files in the bot's personal workspace.

```
/workspace list
/workspace read notes/idea.md
/workspace write notes/todo.md "Buy groceries"
/workspace delete notes/old.md
```

- **Requires**: `WORKSPACE_DIR` configured
- All paths are relative to the workspace directory
- Path traversal (`../`) is blocked

### github

Git operations in the workspace: status, commit, push, pull, log.

```
/git status
/git commit "feat: add new feature"
/git push
/git pull
/git log
```

- **Requires**: `WORKSPACE_DIR` configured
- Uses `SSH_KEY_PATH` for authenticated push/pull (if set)
- Commits are made with bot identity

### n8n_trigger

Trigger an n8n workflow via webhook.

```
/n8n daily-summary
/n8n send-email {"to": "user@example.com", "subject": "Test"}
```

- **Requires**: `N8N_WEBHOOK_BASE` configured
- Sends POST to `{N8N_WEBHOOK_BASE}/{workflow}` with optional JSON data
- 30-second timeout

### n8n_manage

Manage n8n workflows via the REST API: list, get, create, activate, deactivate.

```
/n8n-manage list
/n8n-manage get 123
/n8n-manage activate 123
/n8n-manage deactivate 123
```

- **Requires**: `N8N_API_URL` and `N8N_API_KEY` configured
- Full CRUD access to n8n workflows

### approval

Propose changes for owner approval. Supports new skills, workflows, soul, and identity changes.

```
/pending
/review abc123
/approve abc123
/reject abc123 "not needed"
```

- **Requires**: `WORKSPACE_DIR` and `SELF_IMPROVEMENT=true`
- The LLM can propose changes via `propose` action
- Owner reviews and approves/rejects via slash commands
- Approved skills are hot-loaded into the running bot
- Approved identity changes are merged immediately

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
    return `Result for: ${query}`
  }

  // Optional: async setup after registration
  async init() {}

  // Optional: cleanup during shutdown
  async stop() {}
}
```

2. Export a `register()` function in the same file:

```javascript
export function register(registry, deps) {
  // Conditional: only register if config is present
  if (!deps.config.myToolEnabled) return

  registry.register(new MyTool(deps.config.myToolApiKey))
}
```

3. That's it. `ToolLoader` auto-discovers the file — no changes to `index.js` needed.

The `register()` function receives the full `deps` object with access to `config`, `scheduler`, `watchdog`, `circuitBreaker`, `bus`, `skillLoader`, and `identityLoader`. Use only what your tool needs.

## Source

- [src/tools/base.js](../../src/tools/base.js) — Base class and lifecycle interface
- [src/tools/registry.js](../../src/tools/registry.js) — Registration, execution, and trigger matching
- [src/tools/loader.js](../../src/tools/loader.js) — Auto-discovery and lifecycle management
- [src/tools/web-fetch.js](../../src/tools/web-fetch.js) — URL fetching
- [src/tools/schedule.js](../../src/tools/schedule.js) — Cron scheduling
- [src/tools/diagnostics.js](../../src/tools/diagnostics.js) — Health diagnostics
- [src/tools/workspace.js](../../src/tools/workspace.js) — File operations
- [src/tools/github.js](../../src/tools/github.js) — Git operations
- [src/tools/n8n.js](../../src/tools/n8n.js) — n8n webhook trigger
- [src/tools/n8n-manage.js](../../src/tools/n8n-manage.js) — n8n REST API management
- [src/tools/approval.js](../../src/tools/approval.js) — Self-improvement proposals
- [test/tools/](../../test/tools/) — Tests
