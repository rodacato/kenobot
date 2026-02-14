# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KenoBot is a personal AI assistant (Telegram bot) powered by Claude, built on Node.js 22+ with an event-driven architecture. Pure ESM, no build step, no TypeScript.

## Commands

```bash
# Development
npm start                                    # Run bot (node src/index.js)
npm run dev                                  # Run with --watch
npm test                                     # Run all tests (vitest run)
npm run test:watch                           # Watch mode
npm run test:coverage                        # Coverage report (V8)
npx vitest run test/agent/loop.test.js       # Run a single test file
npm run test:e2e                             # E2E tests (sequential)

# CLI (after npm link or install.sh)
kenobot setup                                # Scaffold ~/.kenobot/
kenobot start -d                             # Start as daemon
kenobot stop                                 # Stop daemon
kenobot status                               # Health check
kenobot doctor                               # Diagnose problems
```

## Architecture

Event-driven architecture with two bounded contexts: the **Nervous System** (signaling) and the **Cognitive System** (memory & identity). All components communicate via the Nervous System (`src/nervous/`) — a signal-aware event bus with middleware, tracing, and audit.

```
User → Telegram → TelegramChannel → bus.fire('message:in') → AgentLoop → ContextBuilder → Provider.chat()
                                                                  ↓
User ← Telegram ← TelegramChannel ← bus.fire('message:out') ← AgentLoop (memory → session)
```

**Entry points**: `src/index.js` (CLI startup, signals), `src/app.js` (`createApp()` — pure composition root factory returning `{ bus, agent, channels, cognitive, start(), stop() }`).

**Key modules**:
- `src/nervous/` — **Nervous System**: signal-aware event bus with middleware pipeline (trace, logging, dead-signal), audit trail (JSONL), and trace correlation
- `src/cognitive/` — **Cognitive System**: orchestrates Memory System (4-tier), Identity System (personality + preferences), and Retrieval Engine
- `src/agent/loop.js` — Core message handler: build context → provider.chat → extract memories → save session → fire response
- `src/agent/context.js` — Assembles system prompt (identity + memory) and message history into provider-agnostic `{ system, messages }` format
- `src/channels/` — Template Method pattern: `BaseChannel` handles permissions/rate-limiting, subclasses (`TelegramChannel`, `HTTPChannel`) are <100 LOC
- `src/providers/` — Registry pattern with self-registration on import. `BaseProvider` interface, implementations: `claude-api`, `claude-cli`, `gemini-api`, `gemini-cli`, `mock`
- `src/storage/` — Strategy pattern: `FilesystemStorage` (JSONL sessions), `MemoryStore` (persistence layer for Memory System)
- `src/scheduler/` — Cron-based tasks firing as synthetic `message:in` signals

**Signals**: `message:in`, `message:out`, `thinking:start`, `error`, `notification`, `config:changed`, `health:*`, `approval:*`

## Conventions

**Language**: All code, comments, commits, docs, filenames must be in English.

**Commits** (enforced by `.githooks/commit-msg`):
```
type(scope): description    # max 72 chars, imperative mood, no period
```
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`, `release`. Every commit requires a `[changelog]` or `[no-changelog]` section. Setup hooks: `git config core.hooksPath .githooks`

**Code style**: 2-space indent, UTF-8, LF endings. Pure ESM with `.js` extensions on all imports. No TypeScript, no ESLint/Prettier.

**Identity files**: `templates/identity/` contains the bot's identity templates (core.md, rules.json, BOOTSTRAP.md). At runtime, identity loads from `~/.kenobot/memory/identity/`. This is the bot's system prompt, not developer instructions.

## Testing

Vitest 4.x with globals enabled (`describe`, `it`, `expect` — no imports needed). Tests in `test/` mirror `src/` structure as `*.test.js`.

Coverage thresholds: lines 50%, functions 35%, branches 55%, statements 50%.

**Principle: Test behavior, not implementation.**

- **Use real implementations**: temp directories (`mkdtemp` + cleanup), `NervousSystem` (for bus), `ContextBuilder`, cognitive classes (`IdentityManager`, `MemorySystem`)
- **Mock only**: `logger.js` (always — suppresses noise), `config.js` (always — import side effects), network boundaries (fetch, Anthropic SDK, Grammy), providers in agent tests
- **Anti-patterns**: Don't `vi.mock('node:fs/promises')` — use real temp dirs. Don't assert mock call args — assert behavior/output.

## Known Gotchas

- `claude-cli` hangs when stdin is a pipe → provider uses `stdio: ['ignore', 'pipe', 'pipe']`
- `claude-cli` is ~20s slow with Sonnet → use `claude-api` for speed
- `gemini-api` uses `model` role instead of `assistant`, no function call IDs (synthetic IDs generated)
- `BOOTSTRAP.md` in identity dir triggers first-conversation onboarding, auto-deleted when bot responds with `<bootstrap-complete/>`
- Non-root devcontainer: runs as `node` user (uid=1000)
- Cognitive System is always enabled. Uses `MemoryStore` for persistence, `IdentityManager` for personality

## Deployment

Two modes code must support: **Stable** (end users, release tags, `kenobot update` = tag checkout) and **Dev** (maintainer VPS, master branch, `kenobot update` = git pull). Detection: detached HEAD (tag) vs on branch (`git symbolic-ref`).

Resource constraint: 2vCPU / 4GB RAM / 40GB disk Hetzner VPS (~$4/month).
