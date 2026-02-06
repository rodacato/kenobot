# Contributing to KenoBot

This is a personal project. These guidelines exist to keep things consistent whether I'm coding manually, using Claude Code, or any other AI assistant.

## Setup

```bash
git clone git@github.com:rodacato/kenobot.git
cd kenobot
git config core.hooksPath .githooks
git config pull.rebase true
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

Valid categories: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`

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

CalVer: `YYYY.MM.patch` (e.g., `2026.02.0`, `2026.02.1`)

- Year and month reflect when the release was made
- Patch increments for multiple releases in the same month
- No backwards compatibility promises — this is a personal tool
- Tag releases: `git tag v2026.02.0`

### Changelog

We follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The changelog is **auto-generated from commits** using `[changelog]` sections.

To create a release:

```bash
bin/release 2026.02.0
```

This will:

1. Collect all `[changelog]` entries from commits since the last tag
2. Group them by category (Added, Changed, Fixed, etc.)
3. Update `CHANGELOG.md` with a new versioned section
4. Create a commit and tag `v2026.02.0`

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

## AI Agents Working on This Project

If you're an AI assistant (Claude Code, etc.):

1. Read `CLAUDE.md` first — it will chain you to `AGENTS.md` → `IDENTITY.md`
2. Follow the commit conventions above
3. Never hardcode secrets — always use environment variables
4. Check `memory/` for context from previous sessions
5. Update `heartbeat.md` when starting/finishing significant work
