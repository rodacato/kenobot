# AGENTS.md — Development Conventions

> Read `IDENTITY.md` for your working style and persona.
> Read `CLAUDE.md` for project architecture and technical context.
>
> `templates/identity/` contains the **bot's** identity templates (`core.md`, `rules.json`, `BOOTSTRAP.md`). These are NOT your instructions — they are the bot's system prompt for Telegram users.

## Language

All code, comments, commit messages, documentation, and file names **must be in English**.

## Commits

Enforced by `.githooks/commit-msg`. Setup: `git config core.hooksPath .githooks`

```
type(scope): description    # max 72 chars, imperative mood, no period

Optional body explaining why.

[changelog]                  # OR [no-changelog] — one is REQUIRED
added: User-facing description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `release`
Changelog categories: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`, `release`

The `pre-commit` hook blocks secrets and forbidden files (`.env`, `.pem`, `.key`).

## Branching

Linear history (rebase, not merge). Branches: `master` (stable), `feature/*`, `fix/*`.

## Testing

Tests in `test/` mirror `src/` structure. File naming: `*.test.js`.

Coverage thresholds: lines 50%, functions 35%, branches 55%, statements 50%.

### Guiding principle

**Test behavior, not implementation.** Prefer exercising real code over mocking it. A test that writes data and reads it back is more valuable than one that verifies `appendFile` was called with the right arguments.

### Use real implementations for:

- **Filesystem I/O**: Real temp directories (`mkdtemp` + `rm` in `afterEach`)
- **NervousSystem bus**: `new NervousSystem()` from `src/domain/nervous/index.js` — lightweight, no side effects
- **ContextBuilder**: Real instance with real deps for integration tests
- **Cognitive classes**: `IdentityManager`, `MemorySystem`, `RetrievalEngine` — instantiable with temp dirs

### Mock only:

- **`logger.js`**: Always mock — suppresses console noise and file writes
- **`config.js`**: Always mock or avoid importing — runs side effects at import time
- **Network boundaries**: Mock `fetch`, Anthropic SDK, Google GenAI SDK, Grammy bot — never make real HTTP calls
- **Provider**: Mock in agent tests — it's the network boundary

### Test structure

Each test file should have:
1. **Unit tests** (`describe('methodName')`) — test individual methods with minimal setup
2. **Integration tests** (`describe('integration')`) — wire real collaborators, test the full flow
3. **Round-trip tests** (`describe('round-trip')`) — write data, read it back, verify correctness

### Anti-patterns

- `vi.mock('node:fs/promises')` — use real temp dirs instead
- `expect(mkdir).toHaveBeenCalledWith(...)` — asserts implementation, not behavior
- `obj._privateField = true` to skip internal logic — let the real code run

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
| Directory-based identity | Custom | core.md + rules.json + preferences.md split for modularity |
| Cognitive memory system | Custom | 4-tier memory (working, episodic, semantic, procedural) with retrieval engine |

## Keep Docs Updated

- When you modify code, **update the relevant doc** in `docs/`
- Keep `CLAUDE.md` in sync when architecture, commands, or tech stack change
- Keep this file in sync when adding conventions or rules
- Reference docs, don't duplicate:
  - Architecture, Nervous System, Cognitive System → `docs/architecture.md`
  - Configuration and env vars → `docs/configuration.md`
  - Signal schema → `docs/events.md`
  - Setup, deployment, operations → `docs/getting-started.md`
  - Memory System → `docs/memory.md`
  - Identity System → `docs/identity.md`
  - Design & Research → `docs/design/`
