# Contributing to KenoBot

This is a personal project. These guidelines exist to keep things consistent whether I'm coding manually, using Claude Code, or any other AI assistant.

## Setup

```bash
git clone git@github.com:rodacato/kenobot.git
cd kenobot
npm install
npm link                                  # Makes 'kenobot' command available globally
git config core.hooksPath .githooks
git config pull.rebase true
```

### Running the bot (development)

**Option A** — Use the CLI (recommended, mirrors production):

```bash
kenobot init            # Scaffold ~/.kenobot/ directories
kenobot config edit     # Set TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS, PROVIDER
kenobot start           # Start the bot (foreground)
```

**Option B** — Use npm scripts (reads `.env` from project root):

```bash
cp .env.example .env    # Edit with your credentials
npm start               # node src/index.js
npm run dev             # Start with --watch for auto-reload
```

**Isolated dev environment** (avoids touching `~/.kenobot/`):

```bash
KENOBOT_HOME=/tmp/kenobot-dev kenobot init
KENOBOT_HOME=/tmp/kenobot-dev kenobot config edit
KENOBOT_HOME=/tmp/kenobot-dev kenobot start
```

`npm link` creates a symlink — any code changes reflect immediately without reinstalling.

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

Commits can include a `[changelog]` section to track notable changes. This is **optional** — not every commit needs one (e.g. refactors, typos).

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

The `commit-msg` hook validates the format if the section is present.

### Rules

- First line: max 72 characters
- Imperative mood: "add" not "added" or "adds"
- No period at the end
- Body (optional): explain *why*, not *what*
- `[changelog]` section (optional): track user-facing changes

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

## Branching

Simple:

- `main` — stable, deployable
- `feature/*` — new features
- `fix/*` — bug fixes

### Rebase, not merge

We keep a linear history. Always rebase instead of merge:

```bash
# Update your branch before pushing
git pull --rebase

# Integrate a feature branch
git checkout feature/my-feature
git rebase main
git checkout main
git merge --ff-only feature/my-feature
```

`git pull.rebase` is configured to `true` in the setup step.

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

## Testing

We use [Vitest](https://vitest.dev) for testing (same as OpenClaw).

### Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# UI mode (interactive browser interface)
npm run test:ui

# Coverage report
npm run test:coverage
```

### Writing Tests

Tests live in `test/` directory, mirroring the `src/` structure:

```
test/
├── core/
│   └── bus.test.js
├── providers/
│   └── mock.test.js
└── channels/
    └── telegram.test.js
```

**Test file naming:** `*.test.js`

**Example test:**

```javascript
import { describe, it, expect } from 'vitest'
import MockProvider from '../../src/providers/mock.js'

describe('MockProvider', () => {
  it('should respond to hello messages', async () => {
    const provider = new MockProvider({ model: 'sonnet' })
    const result = await provider.chat([
      { role: 'user', content: 'hello' }
    ])

    expect(result.content).toMatch(/General Kenobi/i)
  })
})
```

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

1. Read `CLAUDE.md` first — it will chain you to `AGENTS.md` (project context) and `identities/kenobot.md` (bot personality)
2. Follow the commit conventions above
3. Never hardcode secrets — always use environment variables
4. Check `memory/` for context from previous sessions
5. Update `HEARTBEAT.md` when starting/finishing significant work
