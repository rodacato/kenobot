# Contributing to KenoBot

Personal project. These guidelines keep things consistent across manual coding and AI assistants.

## Quick Start (devcontainer)

Open in devcontainer — everything is pre-configured:

```bash
kenobot dev             # Start with auto-reload (uses ~/.kenobot/)
kenobot stop            # Stop when done
```

If you need to reconfigure:

```bash
kenobot config edit     # Opens ~/.kenobot/config/.env in $EDITOR
kenobot doctor          # Verify everything is healthy
```

## Quick Start (manual)

```bash
git clone git@github.com:rodacato/kenobot.git
cd kenobot
npm install
npm link
git config core.hooksPath .githooks
kenobot init
kenobot config edit      # Set TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USERS
kenobot dev
```

## Development Workflow

**Golden path**: Use `kenobot dev` for development.
It reads `~/.kenobot/config/.env`, writes data to `~/.kenobot/data/`, and auto-reloads on file changes. Source tree stays clean.

For quick one-off iteration without the CLI:

```bash
npm run dev             # Reads .env from project root, writes to ./data/
```

### Testing

```bash
npm test                # All tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

See `AGENTS.md` for test conventions and coverage thresholds.

### Useful commands

```bash
kenobot start           # Production-like (no auto-reload)
kenobot status          # Health check + uptime
kenobot logs            # Tail latest log
kenobot purge           # Reset runtime data
kenobot help            # All commands
```

## Commits

Conventional commits enforced by git hook:

```
type(scope): description     # max 72 chars, imperative, no period
```

Types: `feat` `fix` `docs` `style` `refactor` `test` `chore` `ci` `perf` `build` `release`

Every commit needs `[changelog]` or `[no-changelog]`:

```
feat(agent): add multi-turn context

[changelog]
added: Multi-turn conversation context from session history
```

Categories: `added` `changed` `deprecated` `removed` `fixed` `security`

For internal changes:

```
refactor(agent): simplify context assembly

[no-changelog]
```

## Before You Push

- [ ] `npm test` passes
- [ ] `npm run test:coverage` meets thresholds (lines 50%, branches 55%)
- [ ] No secrets in staged files (pre-commit hook checks this)
- [ ] Commit messages have `[changelog]` or `[no-changelog]`
- [ ] Docs updated if you changed behavior

## Branching

Linear history — rebase, not merge:

- `master` — stable, deployable
- `feature/*` — new features
- `fix/*` — bug fixes

```bash
git pull --rebase       # Always rebase
```

## More Info

| Topic | File |
|-------|------|
| Full CLI commands | `AGENTS.md` |
| Architecture | `docs/architecture.md` |
| Configuration | `docs/configuration.md` |
| Getting started from scratch | `docs/getting-started.md` |

## AI Agents

Read `CLAUDE.md` first — it chains to `AGENTS.md` and the identity directory.
