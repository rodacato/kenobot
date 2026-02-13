# Identity System

> Modular identity files that define who your bot is, what it knows, and who it serves.

## Overview

KenoBot's identity is split into three files inside a named directory (e.g. `identities/kenobot/`):

| File | Purpose | Caching |
|------|---------|---------|
| `SOUL.md` | Core personality, values, communication style | Cached at startup |
| `IDENTITY.md` | Technical expertise, architecture philosophy, boundaries | Cached at startup |
| `USER.md` | User preferences, timezone, language, learned facts | Fresh read every request |

This separation allows:
- **SOUL.md** — Rarely changes, defines the bot's character
- **IDENTITY.md** — Changes when the bot gains new capabilities
- **USER.md** — Grows organically as the bot learns about the user

## Directory Structure

```
~/.kenobot/config/identities/
  kenobot/
    SOUL.md          # Who the bot is
    IDENTITY.md      # What the bot knows
    USER.md          # Who the user is
    BOOTSTRAP.md     # First-conversation onboarding (deleted after use)
```

## Bootstrap Flow

When `kenobot setup` creates a fresh installation, the identity directory includes a `BOOTSTRAP.md` file. This triggers a first-conversation onboarding flow:

1. **Bot starts** — IdentityLoader detects `BOOTSTRAP.md` exists
2. **First message** — ContextBuilder injects bootstrap instructions into the system prompt
3. **Conversation** — The bot naturally discovers user preferences:
   - Name, timezone, preferred language
   - Communication style (formal, casual, snarky)
   - Project interests and workflow preferences
   - Boundaries and off-limits topics
4. **Bot updates** — During the conversation, the bot populates `USER.md` with learned preferences
5. **Bootstrap complete** — The bot includes `<bootstrap-complete/>` in its response
6. **Cleanup** — AgentLoop detects the tag and deletes `BOOTSTRAP.md`
7. **Normal operation** — Subsequent conversations no longer include bootstrap instructions

The bootstrap flow is entirely optional. If you delete `BOOTSTRAP.md` manually or pre-fill `USER.md`, the bot skips it.

## System Prompt Assembly

The ContextBuilder assembles the system prompt in this order:

```
[SOUL.md]
---
[IDENTITY.md]
---
## User Profile
[USER.md]
### How to update user preferences
[<user> tag instructions]
---
## First Conversation — Bootstrap    ← only when BOOTSTRAP.md exists
[BOOTSTRAP.md]
---
## Available tools
[tool list]
---
## Available skills
[skill list]
---
## Memory
[long-term + recent notes]
```

## User Preference Learning

The bot can learn user preferences during any conversation (not just bootstrap). When it discovers something worth remembering, it includes a `<user>` tag in its response:

```
<user>Timezone: America/Mexico_City</user>
```

The AgentLoop extracts these tags and appends them to the "Learned Preferences" section of `USER.md`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `IDENTITY_FILE` | `identities/kenobot` | Path to identity directory (relative to config dir or absolute) |

The IdentityLoader auto-detects whether the path is a file or directory:
- **Directory** — loads `SOUL.md`, `IDENTITY.md`, `USER.md` separately
- **File** (`.md`) — loads entire file as soul (backwards compatibility)

## IdentityLoader API

```javascript
const loader = new IdentityLoader('identities/kenobot')
await loader.load()           // Detect mode, cache SOUL + IDENTITY

loader.getSoul()              // Cached soul content (sync)
loader.getIdentity()          // Cached identity content (sync)
await loader.getUser()        // Fresh read of USER.md
await loader.getBootstrap()   // Returns BOOTSTRAP.md content or null
await loader.appendUser(['Timezone: UTC-6'])  // Append to Learned Preferences
await loader.deleteBootstrap() // Delete BOOTSTRAP.md
await loader.reload()          // Force reload SOUL + IDENTITY from disk
```

## Multi-Instance Identities

Each bot instance can have its own identity directory:

```bash
# In main.env
IDENTITY_FILE=identities/kenobot

# In quick.env
IDENTITY_FILE=identities/quick-bot
```

Share `SOUL.md` across instances by symlinking, or give each bot a completely different personality.
