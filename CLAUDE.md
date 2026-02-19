# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KenoBot is a personal AI assistant (Telegram bot) powered by Claude, built for a single user, extensible by design. Pure ESM, no build step, no TypeScript. Runs on a 2vCPU / 4GB RAM / 40GB disk Hetzner VPS (~$4/month).

## Commands

```bash
# Development
npm start                                    # Run bot (node src/index.js)
npm run dev                                  # Run with --watch
npm test                                     # Run all tests (vitest run)
npm run test:watch                           # Watch mode
npm run test:coverage                        # Coverage report (V8)
npx vitest run test/application/post-processors.test.js  # Run a single test file
npm run test:e2e                             # E2E tests (sequential)
npm run test:conversations                   # Conversation scenario tests
npm run lint                                 # ESLint
npm run lint:boundaries                      # Check hexagonal architecture boundaries

# CLI (after npm link or install.sh)
kenobot setup                                # Scaffold ~/.kenobot/ directories
kenobot start [-d]                           # Start (foreground, or -d for daemon)
kenobot stop                                 # Stop daemon
kenobot restart                              # Restart daemon
kenobot status                               # Check if running
kenobot logs                                 # Tail latest log
kenobot config [edit]                        # Show config or open in $EDITOR
kenobot dev                                  # Run with --watch (development mode)
kenobot reset                                # Reset cognitive system
kenobot doctor                               # Diagnose common problems
kenobot update                               # Update to latest release
kenobot version                              # Show version
```

## Architecture

Hexagonal architecture (Ports & Adapters) with strict ESLint-enforced boundaries (`eslint-plugin-boundaries`).

### Layer Rules (deny-by-default)

```
src/
├── domain/           → can import: domain, infrastructure
│   ├── nervous/      # Signal-aware event bus, middleware, audit trail
│   ├── cognitive/    # 4-tier memory, identity, retrieval, consolidation, metacognition
│   ├── consciousness/ # Gateway (port) for fast secondary LLM evaluations
│   ├── motor/        # Tool registry, task entity, workspace helpers, ReAct loop support
│   └── immune/       # Secret scanner, integrity checker, path traversal protection
├── application/      → can import: application, domain, infrastructure
│   ├── loop.js       # Core: message:in → context → provider → [inline tools | background task] → message:out
│   ├── task-runner.js # Background ReAct loop for long-running tasks
│   ├── context.js    # System prompt assembly (identity + memory + history)
│   ├── post-processors.js  # Tag extraction pipeline
│   └── extractors/   # Parse <memory>, <chat-memory>, <working-memory>, <user>, <bootstrap-complete/>
├── adapters/         → can import: adapters, infrastructure
│   ├── channels/     # Telegram (Grammy), HTTP webhook
│   ├── providers/    # Claude API/CLI, Gemini API/CLI, Mock — all implement chat()
│   ├── consciousness/ # Gemini API, Cerebras, CLI adapters for the consciousness gateway
│   ├── storage/      # Filesystem (JSONL sessions), MemoryStore, TaskStore
│   ├── actions/      # Motor System tools: github, shell, file operations
│   └── scheduler/    # Cron jobs (node-cron)
├── infrastructure/   → can import: infrastructure only
│   ├── config.js     # Pure function createConfig(env), no side effects
│   ├── logger.js     # Structured JSONL logging
│   ├── paths.js      # ~/.kenobot/ path resolution
│   └── events.js     # Signal type constants
├── cli/              # CLI subcommands (excluded from boundary rules)
├── app.js            # Composition root: createApp(config, provider, options) → { bus, agent, ... start(), stop() }
└── index.js          # Thin entry point (config, provider registration, process signals)
```

Root files (`app.js`, `index.js`) can import from all layers.

Expert profiles for consciousness live in `templates/experts/*.json` (loaded at runtime). Full architecture, configuration reference, and memory system docs are in `docs/`.

### Message Flow

```
User → Telegram → bus.fire('message:in') → AgentLoop → ContextBuilder → Provider.chat()
                                                ↓
User ← Telegram ← bus.fire('message:out') ← AgentLoop (extract tags → save session)
```

### Key Interfaces

- **Providers**: All implement `chat(messages, options)` returning `{ content, toolCalls, stopReason, usage? }`. Never `complete()`.
- **Composition root**: `createApp()` in `app.js` is a pure factory — use it in E2E tests for isolated instances.
- **Four bounded contexts**: Nervous System (event bus with middleware/tracing/audit), Cognitive System (memory + identity + retrieval + consolidation), Motor System (tools + tasks + background execution), Immune System (secret scanning + integrity checking).
- **Consciousness Gateway**: `evaluate(expertName, taskName, data)` → `Object|null`. One-shot fast LLM calls using expert profiles. Returns `null` on any failure — callers fall back to heuristics. Adapters in `src/adapters/consciousness/`.
- **Motor System**: 7 tools via factory pattern. `github_setup_workspace` triggers background TaskRunner. Tools: `search_web`, `fetch_url`, `github_setup_workspace`, `run_command`, `read_file`, `write_file`, `list_files`.
- **Self-Improvement**: Sleep cycle generates proposals → creates PR via Motor System → fires `approval:proposed` → user notified via Telegram.

**Signals**: `message:in`, `message:out`, `thinking:start`, `error`, `notification`, `config:changed`, `health:degraded`, `health:unhealthy`, `health:recovered`, `approval:proposed`, `approval:approved`, `approval:rejected`, `task:queued`, `task:started`, `task:progress`, `task:completed`, `task:failed`, `task:cancelled`

## Tech Stack

- Node.js 22+, pure ESM (`"type": "module"`, `.js` extensions required on all imports)
- No build step, no TypeScript
- ESLint with `eslint-plugin-boundaries` (enforces hexagonal layer rules)
- Vitest 4.x with globals enabled (describe, it, expect available without imports)
- Runtime deps: grammy, @anthropic-ai/sdk, @google/genai, dotenv, node-cron

## Deployment

Two deployment modes — code changes must work in both:

| | Stable | Dev |
|---|---|---|
| **Audience** | End users, forks | Maintainer + bot on VPS |
| **Tracks** | Latest release tag | master branch |
| **Update method** | `kenobot update` (tag checkout + rollback) | `kenobot update` (git pull + rollback) |
| **Git remote** | HTTPS (read-only) or SSH | SSH (read+write) |
| **Bot can push** | No | Yes (PRs, self-improvement) |
| **Detection** | Detached HEAD (tag) | On a branch (`git symbolic-ref`) |

## Known Gotchas

- **Claude CLI** hangs when stdin is a pipe — `claude-cli` provider uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']`.
- **`claude-cli`** is ~20s slow with Sonnet — use `claude-api` for faster responses.
- **`gemini-cli`** wraps the Google Gemini CLI (`@google/gemini-cli`). Uses `--approval-mode yolo` and `--output-format text` for headless operation. Requires `gemini` installed globally.
- **`gemini-api`** uses `model` instead of `assistant` as the role, and function calls have no `id` field — synthetic IDs are generated.
- **Non-root devcontainer**: running as `node` user (uid=1000).
- **Identity templates**: `templates/identity/` contains `core.md`, `rules.json`, `BOOTSTRAP.md`. At runtime, identity loads from `~/.kenobot/memory/identity/` (with `core.md`, `rules.json`, `preferences.md`).
- **BOOTSTRAP.md** in the identity dir triggers first-conversation onboarding; deleted when response includes `<bootstrap-complete/>`.
- **Cognitive System** is always enabled. Uses `MemoryStore` for persistence, `IdentityManager` for personality.
- **Memory directory**: All runtime memory lives in `~/.kenobot/memory/` (MEMORY.md, daily logs, working/, chats/, embeddings.db, identity/). `MemoryStore` receives `memoryDir` directly in its constructor.

## Development Conventions

All code, comments, commit messages, and docs must be in English. Linear history (rebase, not merge). Branches: `master` (stable), `feature/*`, `fix/*`.

### Commits

Enforced by `.githooks/commit-msg`. First-time setup: `git config core.hooksPath .githooks`

```
type(scope): description    # max 72 chars, imperative mood, no period

Optional body.

[changelog]                 # OR [no-changelog] — one is REQUIRED
fixed: User-facing description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `release`
Changelog categories: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`, `release`

The `pre-commit` hook blocks secrets and forbidden files (`.env`, `.pem`, `.key`).

### Testing

Coverage thresholds: lines 50%, functions 35%, branches 55%, statements 50%.

**Use real implementations for**: filesystem I/O (real temp dirs with `mkdtemp` + cleanup in `afterEach`), `NervousSystem` bus, `ContextBuilder`, `IdentityManager`, `MemorySystem`, `RetrievalEngine`.

**Always mock**: `logger.js` (suppresses noise), `config.js` (has side effects at import time — never import in tests), network boundaries (`fetch`, Anthropic SDK, Google GenAI SDK, Grammy bot).

Anti-patterns to avoid: `vi.mock('node:fs/promises')`, asserting `mkdir` was called instead of verifying the file exists, mutating `_privateField` to skip real logic.

See `AGENTS.md` for full conventions and `IDENTITY.md` for working style.
