# KenoBot — Development Agent Instructions

> **Before responding**, read these files in order:
> 1. `IDENTITY.md` — your role and working style
> 2. `HEARTBEAT.md` (if it exists) — current priorities from previous sessions
>
> `identities/kenobot.md` is the **bot's** personality. `IDENTITY.md` is **yours**.

## Commands

```bash
npm start              # Run the bot (node src/index.js)
npm run dev            # Run with --watch for auto-reload
npm test               # Run all tests (vitest run)
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (V8)
npx vitest run test/agent/loop.test.js  # Run a single test file
bin/health             # Check if bot is running
bin/backup             # Backup data/ directory
bin/release 0.2.0      # Generate changelog + git tag
```

## Architecture (summary)

Event-driven message bus pattern. All components communicate via a singleton `EventEmitter` bus (`src/bus.js`).

```
User → Telegram → TelegramChannel → bus 'message:in' → AgentLoop → ContextBuilder → Provider.chat()
                                                            ↓
User ← Telegram ← TelegramChannel ← bus 'message:out' ← AgentLoop (tool loop → memory → session)
```

**Bus events**: `message:in`, `message:out`, `thinking:start`, `error`

For module details, interfaces, and design patterns → `docs/architecture.md`

## Tech Stack

- **Runtime**: Node.js 22+, pure ESM (`"type": "module"`, `.js` extensions on all imports)
- **No build step**: Source runs directly
- **No TypeScript, no ESLint/Prettier configs**: Uses `.editorconfig` (2-space indent, UTF-8, LF)
- **Runtime deps**: grammy (Telegram), @anthropic-ai/sdk (Claude API), dotenv (env), node-cron (scheduling)
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

Mocking approach: `vi.mock()` for fs/logger, manual mocks for bus/provider/storage, real implementations when possible. Mock external services, not internal code.

## Key Technical Decisions

| Pattern | Origin | Why |
|---------|--------|-----|
| Message bus (EventEmitter) | Nanobot | Decouples channels, agent, providers |
| CLI wrapping for Claude | Claudio | ToS-compliant, official CLI, zero auth setup |
| Context injection via prompt | Claudio | Stateless providers, debuggable context |
| JSONL sessions | OpenClaw | Append-safe, git-friendly, streamable |
| Deny-by-default auth | Inverted from Nanobot | `--dangerously-skip-permissions` demands restricted access |
| Template Method channels | Nanobot | Permission checking inherited, channels are < 100 LOC |
| On-demand skill loading | OpenClaw | Compact skill list in system prompt, full prompt only when triggered |
| Tool trigger regex | Custom | Slash commands work with any provider, even claude-cli |
| Max iterations safety valve | Nanobot | Prevents infinite tool loops (default: 20) |

## Known Gotchas

- The `claude` CLI hangs when stdin is a pipe. The `claude-cli` provider uses `spawn()` with `stdio: ['ignore', 'pipe', 'pipe']` to avoid this.
- `claude-cli` provider needs ~20s response time with sonnet model. Use `claude-api` for faster responses.
- Non-root devcontainer: running as `node` user (uid=1000).
- Skills use `manifest.json` + `SKILL.md` (not `skill.json` + `prompt.md` as originally planned).
- Tool registry uses explicit registration (not auto-discovery) because tools need config injection.

## Mandatory: Keep Docs Updated

- When you modify code, **update the relevant doc** in `docs/`.
- Keep this file (`AGENTS.md`) in sync when adding new modules or conventions.
- Reference docs, don't duplicate:
  - Architecture details, module list, file structure → `docs/architecture.md`
  - Configuration and env vars → `docs/configuration.md`
  - Deployment and operations → `docs/deployment.md`
  - Feature guides → `docs/features/*.md`
