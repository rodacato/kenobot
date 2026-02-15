# KenoBot — Development Agent Instructions

> **Before responding**, read these files in order:
> 1. `IDENTITY.md` — your role and working style
>
> `templates/identities/kenobot/` contains the **bot's** identity templates (SOUL.md, IDENTITY.md, USER.md). `IDENTITY.md` at the project root is **yours**.

## Commands

```bash
# CLI (after install.sh or npm link)
kenobot setup           # Scaffold ~/.kenobot/ directories
kenobot start          # Start bot (foreground)
kenobot start -d       # Start bot (daemon)
kenobot stop           # Stop daemon
kenobot status         # Health check + uptime
kenobot logs           # Tail latest log
kenobot config edit    # Open .env in $EDITOR
kenobot reset          # Reset runtime data (sessions, logs, scheduler)
kenobot doctor         # Diagnose common problems
kenobot update         # Update to latest release tag
kenobot version        # Show version
kenobot init-cognitive # Initialize cognitive system

# Development
npm start              # Run the bot directly (node src/index.js)
npm run dev            # Run with --watch for auto-reload
npm test               # Run all tests (vitest run)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (V8)
npx vitest run test/agent/loop.test.js  # Run a single test file
npm run test:e2e       # E2E tests (sequential)
npm run test:conversations  # Conversation scenario tests
bin/release 0.2.0      # Generate changelog + git tag
```

## Architecture (summary)

Event-driven architecture with two bounded contexts: the **Nervous System** (signaling) and the **Cognitive System** (memory & identity). All components communicate via the Nervous System (`src/nervous/`) — a signal-aware event bus with middleware, tracing, and audit.

```
User → Telegram → TelegramChannel → bus.fire('message:in') → AgentLoop → ContextBuilder → Provider.chat()
                                                                  ↓
User ← Telegram ← TelegramChannel ← bus.fire('message:out') ← AgentLoop (memory → session)
```

**Signals** (defined in `src/events.js`): `message:in`, `message:out`, `thinking:start`, `error`, `notification`, `config:changed`, `health:degraded`, `health:unhealthy`, `health:recovered`, `approval:proposed`, `approval:approved`, `approval:rejected`

**Composition root**: `src/app.js` exports `createApp(config, provider, options)` — pure factory, no side effects, returns `{ bus, agent, channels, cognitive, start(), stop(), ... }`. `src/index.js` is the thin entry point (config loading, provider registration, process signals). Use `createApp` for programmatic boot in E2E tests.

**Nervous System**: Signal-aware event bus with middleware and audit. Located in `src/nervous/`:
- `NervousSystem`: EventEmitter subclass with `fire()`, middleware pipeline, and audit trail
- **Middleware**: Trace propagation, structured logging, dead signal detection
- **Audit Trail**: JSONL persistence of all signals to `{dataDir}/nervous/signals/`

**Cognitive System**: Modular architecture for memory and identity management. Located in `src/cognitive/`:
- `CognitiveSystem`: Main facade orchestrating three sub-systems
- **Memory System** (`memory/`): 4 types of memory (working, episodic, semantic, procedural). Persistence via `MemoryStore` (`src/storage/memory-store.js`)
- **Identity System** (`identity/`): Core personality, behavioral rules, learned preferences, conversational bootstrap
- **Retrieval Engine** (`retrieval/`): Keyword + confidence-based selective memory recall
- **Consolidation** (`consolidation/`): Memory pruning, error analysis, sleep cycle

For module details, interfaces, and design patterns → `docs/architecture.md`

## Tech Stack

- **Runtime**: Node.js 22+, pure ESM (`"type": "module"`, `.js` extensions on all imports)
- **No build step**: Source runs directly
- **No TypeScript, no ESLint/Prettier configs**: Uses `.editorconfig` (2-space indent, UTF-8, LF)
- **Runtime deps**: grammy (Telegram), @anthropic-ai/sdk (Claude API), @google/genai (Gemini API), dotenv (env), node-cron (scheduling)
- **Testing**: Vitest 4.x with globals enabled
- **Dependency budget**: Minimal. Each runtime dep must justify its existence.

## Conventions

### Language

All code, comments, commit messages, documentation, and file names **must be in English**.

### Commits

Enforced by `.githooks/commit-msg`. Setup: `git config core.hooksPath .githooks`

```
type(scope): description    # max 72 chars, imperative mood, no period
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `release`

Every commit must include a `[changelog]` or `[no-changelog]` section:

```
feat(agent): add multi-turn context

[changelog]
added: Multi-turn conversation context from session history
```

Categories: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`

The `pre-commit` hook blocks secrets and forbidden files (`.env`, `.pem`, `.key`).

### Branching

Linear history (rebase, not merge). Branches: `main` (stable), `feature/*`, `fix/*`.

### Testing

Tests in `test/` mirror `src/` structure. File naming: `*.test.js`.

Coverage thresholds: lines 50%, functions 35%, branches 55%, statements 50%.

#### Guiding principle

**Test behavior, not implementation.** Prefer exercising real code over mocking it. A test that writes data and reads it back is more valuable than one that verifies `appendFile` was called with the right arguments.

#### When to use real implementations

- **Filesystem I/O**: Use real temp directories (`mkdtemp` + `rm` in afterEach). See `identity.test.js`, `memory.test.js`, `filesystem.test.js` as reference.
- **Nervous System bus**: Use `new NervousSystem()` from `src/nervous/index.js` — lightweight, no side effects.
- **ContextBuilder**: Use real instance with real deps for integration tests.
- **Cognitive classes**: `IdentityManager`, `MemorySystem`, `RetrievalEngine` — instantiable with temp dirs.

#### When to mock

- **`logger.js`**: Always mock — suppresses console noise and file writes.
- **`config.js`**: Always mock or avoid importing — runs side effects at import time.
- **Network boundaries**: Mock `fetch`, Anthropic SDK, Google GenAI SDK, Grammy bot — never make real HTTP calls.
- **Provider**: Mock in agent tests — it's the network boundary.

#### Test structure

Each test file should have:
1. **Unit tests** (`describe('methodName')`) — test individual methods with minimal setup.
2. **Integration tests** (`describe('integration')`) — wire real collaborators, test the full flow. See `context.test.js` and `loop.test.js` as reference.
3. **Round-trip tests** (`describe('round-trip')`) — write data, read it back, verify correctness. See `memory.test.js` and `filesystem.test.js`.

#### Anti-patterns to avoid

- `vi.mock('node:fs/promises')` — use real temp dirs instead.
- `expect(mkdir).toHaveBeenCalledWith(...)` — asserts implementation, not behavior.
- `obj._privateField = true` to skip internal logic — let the real code run.

## Key Technical Decisions

| Pattern | Origin | Why |
|---------|--------|-----|
| Nervous System (signal bus) | Nanobot → evolved | Decouples components + middleware, tracing, audit |
| CLI wrapping for Claude | Claudio | ToS-compliant, official CLI, zero auth setup |
| Context injection via prompt | Claudio | Stateless providers, debuggable context |
| JSONL sessions | OpenClaw | Append-safe, git-friendly, streamable |
| Deny-by-default auth | Inverted from Nanobot | `--dangerously-skip-permissions` demands restricted access |
| Template Method channels | Nanobot | Permission checking inherited, channels are < 100 LOC |
| Max iterations safety valve | Nanobot | Prevents infinite tool loops (default: 20) |
| Directory-based identity | Custom | SOUL.md + IDENTITY.md + USER.md split for modularity |
| Cognitive memory system | Custom | 4-tier memory (working, episodic, semantic, procedural) with retrieval engine |

## Deployment Channels

KenoBot supports two deployment modes. Code changes must work in both:

| | Stable | Dev |
|---|---|---|
| **Audience** | End users, forks | Maintainer + bot on VPS |
| **Tracks** | Latest release tag | master branch |
| **Update method** | `kenobot update` (tag checkout + rollback) | `kenobot update` (git pull + rollback) |
| **Git remote** | HTTPS (read-only) or SSH | SSH (read+write) |
| **Bot can push** | No | Yes (PRs, self-improvement) |
| **Detection** | Detached HEAD (tag) | On a branch (`git symbolic-ref`) |

When modifying `update.js` or `install.sh`, test both paths.

## Known Gotchas

- The `claude` CLI hangs when stdin is a pipe. The `claude-cli` provider uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` to avoid this.
- `claude-cli` provider needs ~20s response time with sonnet model. Use `claude-api` for faster responses.
- The `gemini-cli` provider wraps the Google Gemini CLI (`@google/gemini-cli`). Uses `--approval-mode yolo` and `--output-format text` for headless operation. Requires `gemini` to be installed globally.
- The `gemini-api` provider uses `@google/genai` SDK directly. Supports native tool use (function calling). Gemini uses `model` instead of `assistant` as the role, and function calls have no `id` field — synthetic IDs are generated.
- Non-root devcontainer: running as `node` user (uid=1000).
- Identity templates live in `templates/identities/kenobot/` (SOUL.md, IDENTITY.md, USER.md, BOOTSTRAP.md). At runtime, identity is loaded from `~/.kenobot/memory/identity/`.
- `BOOTSTRAP.md` in the identity directory triggers first-conversation onboarding. Deleted automatically when the bot includes `<bootstrap-complete/>` in a response.
- **Cognitive System** is always enabled. Memory System uses `MemoryStore` for persistence; Identity System uses `IdentityManager` for personality and preferences.

## Mandatory: Keep Docs Updated

- When you modify code, **update the relevant doc** in `docs/`.
- Keep this file (`AGENTS.md`) in sync when adding new modules or conventions.
- Reference docs, don't duplicate:
  - Architecture, Nervous System, Cognitive System → `docs/architecture.md`
  - Configuration and env vars → `docs/configuration.md`
  - Signal schema → `docs/events.md`
  - Setup, deployment, operations → `docs/getting-started.md`
  - Memory System → `docs/memory.md`
  - Identity System → `docs/identity.md`
  - Design & Research → `docs/design/`
