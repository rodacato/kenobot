# Motor System — Design Document

> Gives the bot the ability to take actions in the world beyond talking: write code, create PRs, execute commands, and improve itself — with an iterative reasoning loop (ReAct) and human-controlled autonomy levels.

**Date**: 2026-02-15
**Status**: Implemented
**Builds on**: [body-systems.md](body-systems.md) (section 5), [nervous-system.md](nervous-system.md)

## Experts Consulted

### From body-systems.md (Motor System section)

| Expert | Field | Key Work | Role |
|--------|-------|----------|------|
| Anthropic | AI Engineering | Building Effective Agents (2024) | Workflows vs. agents taxonomy, agentic loop pattern |
| Andrew Ng | AI / Deep Learning | Agentic Reasoning Design Patterns (2024) | Tool use as foundational pattern |
| LangGraph | Agent Orchestration | Graph-based agent framework (2024-2025) | Stateful pause/resume, checkpointing |
| AutoGPT/BabyAGI | Autonomous Agents | ReAct pattern, task decomposition (2023) | Think → Act → Observe loop |

### New experts for this design

| Expert | Field | Key Work | Role |
|--------|-------|----------|------|
| Sandboxed Execution Architect | Runtime isolation | Deno permissions, V8 isolates, Firecracker | GitHub-as-sandbox validation, shell execution guardrails |
| Tool-Using Agent Researcher | LLM tool ergonomics | Gorilla LLM, Toolformer, Anthropic tool_use | Tool definition format, action design |
| Self-Modifying Systems Theorist | Reflective architectures | Gödel Machine, LISP metacircular evaluator, Smalltalk | Self-modification boundaries, 3-tier risk model |
| Personal Automation Designer | End-user programming | Zapier, iOS Shortcuts, Emacs Lisp | UX of tool creation and approval |
| Production Agent Ops Engineer | Agent operations | LLM agents in production, agent observability | Guardrails: cost caps, kill switches, max iterations |

### Existing experts consulted in review

| Expert | Contribution |
|--------|-------------|
| Gregor Hohpe (EIP) | Identified TaskRunner as a **Process Manager** pattern (EIP Ch. 7) |
| Joe Armstrong (Actor Model) | Identified blocking problem in `_handleMessage` — tasks must be separate processes |
| Greg Young (Event Sourcing) | Task event log for retry, debugging, and cost tracking |
| Eric Evans (DDD) | Motor System as a third bounded context, separate from Nervous and Cognitive |
| Software Architect (#3) | Motor System as generic action capability, not a plugin system |
| Security Reviewer (#11) | Per-repo permission model, fine-grained PATs, secret scanning |
| FinOps (#5) | Budget per task, provider routing (Sonnet for coding, Opus on request) |

## Context

### The current limitation

`AgentLoop._handleMessage` (src/application/loop.js) does exactly **one LLM call per message**. It cannot:
- Call a tool and feed the result back to the LLM
- Break a complex request into steps
- Loop until a task is done
- Run in background while the user keeps chatting

### Infrastructure that exists

`BaseProvider` (src/adapters/providers/base.js) already defines tool support stubs:
- `adaptToolDefinitions(definitions)` — adapts tool schemas to provider format
- `buildToolResultMessages(rawContent, results)` — formats tool results for the LLM
- `get supportsTools` — whether provider handles tool calls (default: false)

The Nervous System (src/domain/nervous/) supports arbitrary signal types — no changes needed, only new signal constants.

The Scheduler (src/adapters/scheduler/scheduler.js) persists and executes cron-based tasks via `MESSAGE_IN` signals — a simple Process Manager that could integrate with the Motor System.

Approval workflow signals are reserved in src/infrastructure/events.js (`approval:proposed`, `approval:approved`, `approval:rejected`) but have no listeners.

## The Key Insight: GitHub as Sandbox

The bot gets its own GitHub account with access only to repositories the user explicitly grants. All code changes go through PRs (unless the user marks a repo as autonomous for prototyping).

This means:
- **No sandboxed code execution needed** for the code itself — PRs are the review mechanism
- **Repos are the permission boundary** — the bot can only touch what it has access to
- **Git history is the audit trail** — every action is a commit
- **Rollback is trivial** — revert the PR

Shell execution (tests, builds) still needs basic guardrails (timeouts, resource limits) but runs on the bot's own VPS, not in a VM.

## Three Levels of Self-Modification

| Level | Example | Risk | Default approval |
|-------|---------|------|-----------------|
| **Create new things** | New tool in `kenobot-tools` repo | Low | Can be autonomous |
| **Modify own code** | PR to `kenobot` repo | Medium | Always PR |
| **Modify identity/memory** | Change SOUL.md, working memory | High | Always PR + explicit review |

The bot can freely create. Modifying existing things requires more friction. Modifying itself requires the most.

## Architecture

### Bounded Context

The Motor System is a **third bounded context**, alongside the Nervous System (signaling) and Cognitive System (memory/identity):

```
Nervous System → signals (instantaneous, fire-and-forget)
Cognitive System → memory, identity, retrieval (persistent "who I am")
Motor System → tasks, actions, tools (persistent "what I'm doing")
```

### Module Structure (Hexagonal Architecture)

```
src/
  domain/
    motor/
      task.js              — Task entity (state machine, lifecycle)
      action-registry.js   — Tool definitions catalog (schemas, no I/O)
  application/
    task-runner.js         — ReAct loop orchestrator (Process Manager)
    loop.js                — MODIFIED: detect tool_use, spawn tasks
  adapters/
    actions/
      github.js            — clone, branch, commit, push, create PR
      file.js              — read, write, edit (within cloned repos)
      shell.js             — npm test, npm run build (with timeout + limits)
      search.js            — web search for research
    storage/
      task-store.js        — Task persistence (JSONL event log)
  infrastructure/
    events.js              — MODIFIED: add task:* signal constants
```

### Signal Flow

```
User: "Crea un plugin para n8n"
        │
        ▼
    message:in
        │
        ▼
    AgentLoop._handleMessage
        │
        ├── LLM responds with tool_calls (or detects task intent)
        │
        ▼
    AgentLoop detects this needs the ReAct loop
        │
        ├── Fires task:accepted → translated to message:out
        │   "Entendido, voy a trabajar en eso."
        │
        ├── Spawns TaskRunner (background, non-blocking)
        │
        └── Handler returns (user can keep chatting)

    TaskRunner (background)
        │
        ├── ReAct iteration 1:
        │   ├── LLM: "I need to research the n8n API"
        │   ├── Action: search_web("n8n REST API documentation")
        │   ├── Observe: found docs at docs.n8n.io/api/
        │   └── Fires task:progress → message:out
        │       "Investigando la API de n8n..."
        │
        ├── ReAct iteration 2:
        │   ├── LLM: "I'll clone the repo and create the plugin"
        │   ├── Action: github_clone("kenobot-tools")
        │   ├── Action: file_write("n8n-plugin/index.js", code)
        │   └── Observe: files created
        │
        ├── ReAct iteration 3:
        │   ├── Action: shell_exec("npm test")
        │   ├── Observe: 3/3 tests pass
        │   └── Fires task:progress → message:out
        │       "Tests pasan, creando PR..."
        │
        ├── ReAct iteration 4:
        │   ├── Action: github_create_pr(...)
        │   └── Observe: PR #5 created
        │
        └── Fires task:completed → message:out
            "PR listo: github.com/kenobot-tools/pull/5"
```

### How AgentLoop Changes (Minimal)

The AgentLoop stays simple for normal messages. The change is detecting when a message requires the Motor System:

```
message:in
    │
    ▼
┌──────────────────────┐
│  LLM call (as today) │
│  but now with tools   │
│  defined              │
└──────┬───────────────┘
       │
       ├── stopReason: "end_turn"     → normal response (as today)
       │
       └── stopReason: "tool_use"     → enter ReAct loop
           │
           ├── Quick tool (search, read) → resolve inline, loop again
           │
           └── Long task (coding, PR)    → spawn TaskRunner in background
```

The decision of "inline vs background" can start simple: if the task involves git operations, it's background. Everything else is inline.

## Actions (The Bot's Hands)

Each action is a tool definition the LLM can invoke via Anthropic's tool_use API:

### github_clone
```json
{
  "name": "github_clone",
  "description": "Clone a repository the bot has access to",
  "input_schema": {
    "type": "object",
    "properties": {
      "repo": { "type": "string", "description": "Repository name (e.g. 'kenobot-tools')" },
      "branch": { "type": "string", "description": "Branch to create (optional)" }
    },
    "required": ["repo"]
  }
}
```

### github_create_pr
```json
{
  "name": "github_create_pr",
  "description": "Create a pull request in a repository",
  "input_schema": {
    "type": "object",
    "properties": {
      "repo": { "type": "string" },
      "title": { "type": "string" },
      "body": { "type": "string" },
      "branch": { "type": "string" }
    },
    "required": ["repo", "title", "branch"]
  }
}
```

### file_read, file_write, file_edit
```json
{
  "name": "file_write",
  "description": "Write a file in the current working repository",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Relative path within the repo" },
      "content": { "type": "string" }
    },
    "required": ["path", "content"]
  }
}
```

### shell_exec
```json
{
  "name": "shell_exec",
  "description": "Execute a shell command in the current working repository",
  "input_schema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "Command to execute (e.g. 'npm test')" },
      "timeout_ms": { "type": "number", "description": "Timeout in ms (default: 60000, max: 300000)" }
    },
    "required": ["command"]
  }
}
```

### search_web
```json
{
  "name": "search_web",
  "description": "Search the web for information",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

## TaskRunner — The Process Manager

The TaskRunner is the core of the Motor System. It implements the ReAct pattern as a Process Manager (EIP Ch. 7):

```
┌─────────────────────────────────────────────┐
│  TaskRunner                                  │
│                                              │
│  state: { id, input, chatId, status,         │
│           steps: [], iteration: 0,           │
│           budget: { spent: 0, limit: N },    │
│           repo: { name, path, branch } }     │
│                                              │
│  loop:                                       │
│    1. Build messages (system + history +      │
│       previous steps as tool results)        │
│    2. Call provider.chat(messages, { tools }) │
│    3. If stopReason == "end_turn" → done     │
│    4. If stopReason == "tool_use":           │
│       a. Execute each tool call              │
│       b. Record step in event log            │
│       c. Check guardrails (budget, max iter) │
│       d. Optionally fire task:progress       │
│       e. Go to 1                             │
│                                              │
│  on error: fire task:failed, persist state   │
│  on cancel: fire task:cancelled, cleanup     │
│  on complete: fire task:completed            │
└─────────────────────────────────────────────┘
```

### Task Persistence (Event Log)

Each task persists as a JSONL event log in `data/motor/tasks/{taskId}.jsonl`:

```jsonl
{"event":"created","taskId":"abc","input":"crea plugin n8n","chatId":"123","ts":1708000000}
{"event":"step","iteration":1,"action":"search_web","input":{"query":"n8n API docs"},"output":"found docs...","tokens":1200,"ts":1708000005}
{"event":"step","iteration":2,"action":"github_clone","input":{"repo":"kenobot-tools"},"output":"cloned to /tmp/...","tokens":800,"ts":1708000010}
{"event":"step","iteration":3,"action":"file_write","input":{"path":"n8n/index.js"},"output":"written","tokens":2500,"ts":1708000020}
{"event":"step","iteration":4,"action":"shell_exec","input":{"command":"npm test"},"output":"4/4 passed","tokens":600,"ts":1708000030}
{"event":"progress","message":"Tests pasan, creando PR...","ts":1708000031}
{"event":"completed","output":"PR #5 created","totalTokens":8400,"totalSteps":4,"durationMs":45000,"ts":1708000035}
```

This enables: retry from last step, debugging, cost tracking, and audit.

## Guardrails

### Iteration limit
```javascript
const MAX_ITERATIONS = 30  // hard cap per task
```

### Cost tracking
Since the bot uses CLI providers, cost isn't monetary — it's rate limits and time. Track:
- **Iterations**: how many ReAct loops
- **Wall time**: total duration (max 30 min default)
- **LLM calls**: total provider invocations
- **Actions**: total tool executions

### Kill switch
User sends "para" / "stop" / "cancel" during a running task → AgentLoop recognizes it as a cancellation → fires `task:cancelled` → TaskRunner catches it and stops.

### Shell execution limits
```javascript
const SHELL_DEFAULTS = {
  timeout: 60_000,        // 1 min per command
  maxTimeout: 300_000,    // 5 min absolute max
  maxOutputBytes: 1_000_000  // 1MB output cap
}
```

No `sudo`, no writing outside the repo working directory. The bot already runs as unprivileged `node` user.

### Secret scanning
Pre-commit check: reject commits containing patterns that look like tokens, API keys, or passwords. Simple regex patterns, not a full scanner.

## Autonomy Levels

Configured per repository:

```javascript
// In bot config or ~/.kenobot/config.json
{
  "motor": {
    "repos": {
      "kenobot-tools":  { "mode": "autonomous", "owner": "kenobot-ai" },
      "kenobot":        { "mode": "pr-required", "owner": "kenobot-ai" },
      "my-ideas":       { "mode": "pr-required", "owner": "kenobot-ai" }
    },
    "github": {
      "token": "env:KENOBOT_GITHUB_TOKEN",
      "username": "kenobot-ai"
    },
    "defaults": {
      "mode": "pr-required",
      "maxIterations": 30,
      "maxDurationMs": 1800000
    }
  }
}
```

| Mode | Behavior | Use case |
|------|----------|----------|
| `pr-required` | Always creates branch + PR. Reports PR URL. | Production repos, bot's own code |
| `autonomous` | Pushes directly to main/default branch. | Prototypes, experiments, scratch repos |

The user can override per-request: "hazlo directo, es un prototipo" → autonomous mode for this task even if repo default is pr-required.

## Nervous System Integration

The Nervous System does NOT change. It already supports arbitrary signals. New signal constants:

```javascript
// Task lifecycle (emitted by Motor System)
export const TASK_ACCEPTED   = 'task:accepted'
export const TASK_PROGRESS   = 'task:progress'
export const TASK_COMPLETED  = 'task:completed'
export const TASK_FAILED     = 'task:failed'
export const TASK_CANCELLED  = 'task:cancelled'
```

A listener in the Motor System translates these to `message:out` signals for user-visible updates:

```javascript
bus.on(TASK_PROGRESS, ({ chatId, message, channel }) => {
  bus.fire(MESSAGE_OUT, { chatId, text: message, channel }, { source: 'motor' })
})
```

The audit trail automatically records all task signals — no extra work needed.

## Scheduler Integration

The existing Scheduler can remain unchanged initially. It fires `MESSAGE_IN` → the AgentLoop decides if it's a task. Future option: Scheduler fires `TASK_ACCEPTED` directly for known task-type jobs.

## Implementation Phases

### Phase 0: ReAct Loop (the engine)

**Goal**: The bot can use tools within a conversation (inline, synchronous).

**What changes**:
- `claude-api` provider: enable tool_use support (it already returns `toolCalls` in the response contract)
- `AgentLoop._handleMessage`: after getting a response with `stopReason: "tool_use"`, execute the tools and loop back to the provider with results
- Define initial tools: `search_web`, `file_read` (read URLs/pages)
- Max iterations per message (default: 10)

**What doesn't change**: Everything is still synchronous within `_handleMessage`. No background tasks yet. No git operations.

**User experience**:
```
User: "¿Cuáles son los endpoints de la API de n8n?"
Bot:  [searches web, reads docs, responds with real information]
```

### Phase 1: Actions (the hands)

**Goal**: The bot can read/write files, execute commands, and interact with GitHub.

**What's built**:
- `src/adapters/actions/` — GitHub, file, and shell actions as tool definitions
- Action executor with guardrails (timeouts, path restrictions, secret scanning)
- Repo permission config (`motor.repos` in config)
- Git authentication (bot's own GitHub PAT)

**User experience**:
```
User: "Hazme un script de backup en kenobot-tools"
Bot:  [clones repo, writes code, runs tests, creates PR]
      "PR listo: github.com/kenobot-tools/pull/3"
```

At this point tasks still run inline (blocking). Short tasks (< 2 min) work fine. Longer tasks cause the typing indicator to show for too long.

### Phase 2: Background Tasks (the agenda)

**Goal**: Long-running tasks don't block the conversation.

**What's built**:
- `TaskRunner` as a background process (Promise that runs independently)
- Task lifecycle signals (`task:accepted` → `task:progress` → `task:completed`)
- Signal-to-message translation (progress updates sent via Telegram)
- Task persistence (JSONL event log per task)
- Kill switch (user says "para" → task cancels)
- Concurrent task limit (default: 1 active task per chat)

**User experience**:
```
User: "Diseña e implementa un plugin para manejar n8n"
Bot:  "Entendido, trabajando en eso. Te voy avisando."
      [user can keep chatting normally]
Bot:  "Investigando la API de n8n..."
Bot:  "Esqueleto creado, implementando comandos..."
Bot:  "Tests pasan (4/4). PR listo: github.com/kenobot-tools/pull/5"
```

### Phase 3: Self-Improvement

**Goal**: The bot can modify its own codebase and propose improvements.

**What's built**:
- Bot can create PRs to its own `kenobot` repo (always pr-required)
- Integration with existing self-improver proposals: instead of just writing markdown, the bot can implement the fix
- Identity protection: PRs that modify `templates/identity/` or `~/.kenobot/memory/identity/` require explicit user confirmation before even creating the PR

**User experience**:
```
Bot:  "Detecté que el date parser falla con DD/MM/YYYY (3 errores esta semana). ¿Quieres que lo arregle?"
User: "Sí dale"
Bot:  [writes fix + tests, creates PR]
      "PR: github.com/kenobot/pull/42 — fix date parser + 2 tests"
```

## Interaction Examples

### Simple research (Phase 0)
```
User: "Investiga cómo funciona la API de n8n"
Bot:  [search_web → fetch_url → summarize]
      "La API de n8n tiene estos endpoints: ..."
```

### Create a tool (Phase 1+2)
```
User: "Crea un plugin para que puedas manejar n8n"
Bot:  "Entendido. Voy a investigar la API, diseñar el plugin, implementarlo y crear un PR."
      ...progress updates...
      "PR listo. 3 comandos: /workflows, /run, /status"
```

### Design and implement an idea (Phase 1+2)
```
User: "Quiero que puedas analizar recibos con fotos"
Bot:  "Para eso necesito: OCR (Claude vision), un store de gastos, y un comando /gastos.
       ¿Lo implemento en kenobot-tools como plugin?"
User: "Sí, es experimental, hazlo autónomo"
Bot:  "Perfecto, pusheando directo."
      ...progress updates...
      "Listo. Mándame un recibo de prueba."
```

### Self-improvement (Phase 3)
```
Bot:  "Noté que me preguntas el clima todos los días a las 7am.
       ¿Quieres que te lo mande automáticamente?"
User: "Sí"
Bot:  [creates scheduled task + implementation as PR to kenobot]
      "PR: github.com/kenobot/pull/45 — daily weather briefing"
```

### Cancel a running task
```
User: "Crea un sistema de análisis financiero completo"
Bot:  "Entendido, trabajando..."
Bot:  "Investigando APIs de datos financieros..."
User: "Para, mejor lo hacemos diferente"
Bot:  "Tarea cancelada. El progreso parcial está en la branch feat/financial-analysis
       por si quieres retomarlo después."
```

## The Complete Body Map (Updated)

```
MOTOR SYSTEM (src/domain/motor/ + src/adapters/actions/)             [DESIGNED]
  Motor Cortex ............ TaskRunner (plan and orchestrate tasks)
  Hands ................... Actions (github, file, shell, search)
  Cerebellum .............. ReAct loop (coordination and iteration)
  Proprioception .......... Task event log (feedback about results)
  Muscle Memory ........... Repo config + autonomy levels
```

## Open Questions

1. **Provider routing for tasks**: Should tasks always use a specific provider (e.g. claude-api with tool_use), or respect the globally configured provider? CLI providers (claude-cli, gemini-cli) may not support tool_use natively.

2. **Multi-file context**: When the bot is working on a repo, how much code context does it get? Full repo in context? Only files it's touching? RAG over the repo?

3. **Task resumption**: If the bot crashes mid-task, should it auto-resume on restart, or wait for user confirmation?

4. **Concurrent tasks**: Should the bot handle multiple tasks simultaneously (e.g. one per chat), or globally one at a time?

5. **Testing strategy**: How to test the ReAct loop without making real LLM calls or git operations? Mock provider + temp git repos?

## References

### From body-systems.md
- Anthropic (2024). *Building Effective Agents.* — Workflows vs. agents, agentic loop
- Andrew Ng (2024). *Agentic Reasoning Design Patterns.* — Tool use as foundational
- LangGraph (2024-2025). — Stateful graph-based agent orchestration
- AutoGPT/BabyAGI (Nakajima, 2023). — ReAct pattern, task decomposition

### Enterprise Integration Patterns
- Hohpe & Woolf (2003). *Enterprise Integration Patterns.* — Ch. 7: Process Manager

### New for this design
- Deno permission model — capability-based security for runtime isolation
- GitHub fine-grained PATs — scoped repository access tokens
- Schmidhuber (2003). *Gödel Machines.* — Self-modifying systems theory
