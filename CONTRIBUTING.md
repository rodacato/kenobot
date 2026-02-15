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
kenobot setup
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
kenobot reset           # Reset runtime data
kenobot help            # All commands
```

## Commits

Conventional commits enforced via git hook:

```
type(scope): description
```

### Types

| Type | When |
|------|------|
| `feat` | New functionality |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code change that neither fixes nor adds |
| `test` | Adding or fixing tests |
| `chore` | Maintenance, deps, config |
| `ci` | CI/CD changes |
| `perf` | Performance improvement |
| `build` | Build system changes |
| `release` | Version releases (used by `bin/release`) |

### Scope

Optional but encouraged. Use the component name:

```
feat(telegram): add voice message support
fix(memory): prevent duplicate daily entries
chore(deps): update anthropic sdk
docs(research): add openclaw analysis
```

### Changelog Section

Every commit must include either `[changelog]` (with release-note entries) or `[no-changelog]` (for changes that don't need release notes). Enforced by the `commit-msg` hook.

```
feat(memory): add daily markdown notes

Stores daily notes as append-only markdown files
for lightweight persistent memory.

[changelog]
added: Daily markdown notes in memory/ directory
```

Valid categories: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`, `release`

Multiple entries per commit are fine:

```
[changelog]
added: Voice message support via Telegram
fixed: Message deduplication on reconnect
```

For commits without user-facing changes:

```
refactor(agent): simplify context assembly

[no-changelog]
```

The `commit-msg` hook validates the format and rejects commits missing both markers.

### Rules

- First line: max 72 characters
- Imperative mood: "add" not "added" or "adds"
- No period at the end
- Body (optional): explain *why*, not *what*
- `[changelog]` or `[no-changelog]` section (required by hook)

## Versioning

Semver: `MAJOR.MINOR.PATCH` (e.g., `0.1.0`, `0.2.0`, `1.0.0`)

- MAJOR: breaking changes
- MINOR: new features (backwards-compatible)
- PATCH: bug fixes
- Tag releases: `git tag v0.1.0`

### Changelog

We follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The changelog is **auto-generated from commits** using `[changelog]` sections.

To create a release:

```bash
bin/release 0.2.0
```

This will:

1. Find the last release commit (by searching for `release:` in `[changelog]`)
2. Collect all `[changelog]` entries from commits since that release
3. Group them by category (Added, Changed, Fixed, etc.)
4. Update `CHANGELOG.md` with a new versioned section
5. Create a commit (`release: Bump version vX.Y.Z`) and tag `vX.Y.Z`

The release commit marks the boundary for the next release:

```
release: Bump version v0.2.0

[changelog]
release: 0.2.0
```

## Before You Push

- [ ] `npm test` passes
- [ ] `npm run test:coverage` meets thresholds (lines 50%, branches 55%)
- [ ] No secrets in staged files (pre-commit hook checks this)
- [ ] Commit messages have `[changelog]` or `[no-changelog]`
- [ ] Docs updated if you changed behavior

## Security

### Never commit

- API keys, tokens, passwords
- `.env` files (use `.env.example` as template)
- Private keys, certificates
- Database files with personal data

The `pre-commit` hook will block obvious secrets automatically.

### If you accidentally commit a secret

1. Rotate the credential immediately
2. Remove from git history: `git filter-branch` or `git-filter-repo`
3. Force push (only time this is acceptable)
4. Verify the old credential no longer works

## Code Style

- Simple over clever
- Follow existing patterns in the codebase
- Self-documenting code; comments only for non-obvious logic
- Prefer small, focused functions

## Branching

Simple:

- `master` — stable, deployable
- `feature/*` — new features
- `fix/*` — bug fixes

### Rebase, not merge

We keep a linear history. Always rebase instead of merge:

```bash
# Update your branch before pushing
git pull --rebase

# Integrate a feature branch
git checkout feature/my-feature
git rebase master
git checkout master
git merge --ff-only feature/my-feature
```

`git pull.rebase` is configured to `true` in the setup step.

## More Info

| Topic | File |
|-------|------|
| Full CLI commands | `AGENTS.md` |
| Architecture | `docs/architecture.md` |
| Configuration | `docs/configuration.md` |
| Getting started from scratch | `docs/getting-started.md` |

## Testing

We use [Vitest](https://vitest.dev) for testing.

### Coverage Requirements

Phase 0 baseline (current):
- Lines: 50%
- Functions: 35%
- Branches: 55%
- Statements: 50%

These thresholds will increase as the project matures. Coverage reports are in `coverage/index.html` (not committed).

### What to Test

**Priority 1 (always test):**
- Business logic (providers, agent loops)
- Data transformations (message chunking, parsing)
- Core utilities (bus, helpers)

**Priority 2 (test when practical):**
- Integration points (channels, APIs)
- Configuration loading
- Error handling paths

**Skip testing:**
- External library wrappers (test behavior, not the library)
- Entry points (`src/index.js`) — use E2E tests instead
- Pure interfaces with no logic

### Testing Guidelines

1. **Test behavior, not implementation**
   ```javascript
   // ✅ Good: test what it does
   expect(result.content).toMatch(/General Kenobi/)

   // ❌ Bad: test how it does it
   expect(provider.internalState).toBe('ready')
   ```

2. **One assertion per logical concept**
   ```javascript
   // ✅ Good
   it('should return valid response format', () => {
     expect(result.content).toBeDefined()
     expect(result.usage).toBeDefined()
   })

   // ❌ Bad
   it('should do everything', () => {
     expect(x).toBe(1)
     expect(y).toBe(2)
     expect(z).toBe(3)
   })
   ```

3. **Use descriptive test names**
   ```javascript
   // ✅ Good
   it('should split messages longer than 4000 chars into chunks')

   // ❌ Bad
   it('chunking works')
   ```

4. **Async tests**
   ```javascript
   it('should handle async operations', async () => {
     const result = await provider.chat([...])
     expect(result).toBeDefined()
   })
   ```

5. **Mock sparingly**
   - Use real implementations when possible
   - Mock external services (Telegram API, Claude API)
   - Don't mock internal code you control

## AI Agents Working on This Project

If you're an AI assistant (Claude Code, etc.):

1. Read `CLAUDE.md` first — it will chain you to `AGENTS.md` (project context) and `templates/identity/` (bot identity directory)
2. Follow the commit conventions above
3. **Do not add co-author tags to commits** — all commits should be single-authored
4. Never hardcode secrets — always use environment variables
5. Check `memory/` for context from previous sessions
6. Update `HEARTBEAT.md` when starting/finishing significant work
