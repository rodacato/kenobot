# Developer Experience

> Improving the development workflow — from clone to running in fewer steps.

**Date**: 2026-02-14
**Status**: Designed

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| Jeff Dickey | CLI architecture | oclif (Heroku CLI framework), `mise` | Inspired `KENOBOT_HOME` pattern from `GH_CONFIG_DIR` |
| Sindre Sorhus | Developer tools | 1000+ npm packages, `meow`, `conf` | Small, focused, composable module philosophy |
| Liran Tal | CLI best practices | Node.js CLI Apps Best Practices guide | Error handling, config management, output formatting |
| clig.dev contributors | CLI UX | Command Line Interface Guidelines | "Human-first design", configuration hierarchy |

## Context

There are two ways to run KenoBot, and neither is ideal for development:

| Command | Config source | Data dir | Auto-reload | Isolated |
|---------|--------------|----------|-------------|----------|
| `npm start` | `.env` (project root) | `./data/` | No | No |
| `npm run dev` | `.env` (project root) | `./data/` | Yes | No |
| `kenobot start` | `~/.kenobot/config/.env` | `~/.kenobot/data/` | No | Yes |

Issues:
1. DevContainer doesn't run `npm link` or `kenobot init` — `kenobot` command doesn't work out of the box
2. `npm start`/`npm run dev` write data into the source tree (`./data/`)
3. No command combines auto-reload + isolation
4. Two `.env` files cause confusion (project root vs `~/.kenobot/config/.env`)
5. `CONTRIBUTING.md` is 345 lines — too much cognitive load

## Solution

### 1. Zero-config DevContainer setup

**Files:** `.devcontainer/setup.sh` (new), `.devcontainer/devcontainer.json` (modify)

Create a setup script that runs as `postCreateCommand`:
- `npm install && npm link` — makes `kenobot` available globally
- `kenobot init` — scaffolds `~/.kenobot/`
- Patches `~/.kenobot/config/.env` with forwarded env vars from host

After opening the devcontainer, `kenobot start` works immediately.

### 2. New `kenobot dev` command

**Files:** `src/cli/dev.js` (new), `src/cli.js` (add entry)

Combines the best of both worlds:
- Uses `~/.kenobot/` paths (isolated, like `kenobot start`)
- Runs with `node --watch` (auto-reload, like `npm run dev`)

```
kenobot dev    # auto-reload + isolated ~/.kenobot/ paths
```

### 3. Clarify `.env` file roles

**File:** `templates/env.example` (add header)

The template that `kenobot init` copies should clearly state it's the production config.

### 4. Rewrite CONTRIBUTING.md

**File:** `CONTRIBUTING.md` (rewrite)

From 345 lines to ~100. Action-oriented, with a "Before You Push" checklist.

### 5. Remove TESTING_GUIDE.md

**File:** `TESTING_GUIDE.md` (delete)

Written in Spanish, cognitive-system-specific, duplicates AGENTS.md content.

## New Workflow After Changes

```
# DevContainer opens → everything is ready

kenobot dev             # Development (auto-reload + isolated)
kenobot start           # Production-like (no auto-reload)
kenobot config edit     # Edit ~/.kenobot/config/.env
kenobot doctor          # Health check

npm test                # Run tests
npm run test:watch      # Watch mode
```

## References

### CLI Projects Studied

**GitHub CLI (`gh`)**
- Pattern: `GH_CONFIG_DIR` env var for complete config isolation
- What we took: The `KENOBOT_HOME` env var pattern. Set `KENOBOT_HOME=/tmp/kenobot-test` for full isolation.
- Docs: https://cli.github.com/manual/gh_help_environment

**Vercel CLI**
- Pattern: Environment layers (`.env.local`, `.env.development`, `.env.production`)
- What we took: Separating local dev config from production config.
- Docs: https://vercel.com/docs/environment-variables

**Wrangler (Cloudflare Workers CLI)**
- Pattern: `--env` flag with named environments
- What we took: Environments-as-deployment-targets concept.
- Docs: https://developers.cloudflare.com/workers/wrangler/environments/

**Railway CLI**
- Pattern: `railway run <cmd>` injects env vars from deployed environment
- What we took: Keeping env vars out of local files. Our devcontainer patches config at creation time.
- Docs: https://docs.railway.com/guides/cli

### Guidelines & Standards

**Command Line Interface Guidelines (clig.dev)**
- Key takeaways: "Human-first design", "Configuration hierarchy" (flags > env vars > config files > defaults), "Be predictable"
- Applied: `kenobot init` + `kenobot start` follows "good defaults" principle. `KENOBOT_HOME` is the escape hatch.

**XDG Base Directory Specification**
- Our decision: **NOT to use it.** `~/.kenobot/` is simpler, more discoverable, easier to debug. JS/Node ecosystem doesn't follow XDG consistently. Single directory = easier backup/restore.

### Key Decisions

| Decision | What we chose | Why | Alternative considered |
|----------|--------------|-----|----------------------|
| Home directory | `~/.kenobot/` | Simple, discoverable | XDG split dirs |
| CLI framework | Native `parseArgs` | Zero deps, sufficient | commander, oclif |
| Config format | `.env` (dotenv) | Universal, simple | TOML, YAML, JSON |
| Dev isolation | `KENOBOT_HOME` env var | Same as gh CLI | Docker volumes |
| Auto-reload | `node --watch` (native) | Zero deps, Node 22+ | nodemon, tsx |
| Devcontainer setup | Shell script | Testable, commentable | Inline postCreateCommand |

### People to Follow

- **Jeff Dickey** (@jdxcode) — Creator of oclif. Blog: jdx.dev. Tool: `mise` (dev env manager)
- **Sindre Sorhus** — github.com/sindresorhus. Key packages: `meow`, `conf`, `env-paths`
- **Liran Tal** — github.com/lirantal. Author of nodejs-cli-apps-best-practices guide
