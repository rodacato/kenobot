# Multi-Instance

> Run multiple bots with different identities, providers, and data — using only configuration files.

## Overview

KenoBot's config-driven design means you can run multiple independent bot instances without any code changes. Each instance gets its own:

- Telegram bot (different `TELEGRAM_BOT_TOKEN`)
- Identity / personality (different `IDENTITY_FILE`)
- LLM provider and model (different `PROVIDER` + `MODEL`)
- Data directory (different `DATA_DIR` for isolated sessions, memory, logs)

## Setup

### 1. Create Config Files

```bash
mkdir -p ~/.kenobot/config
```

**~/.kenobot/config/main.env** — Primary bot:
```bash
PROVIDER=claude-api
MODEL=opus
IDENTITY_FILE=identities/kenobot
TELEGRAM_BOT_TOKEN=<main_bot_token>
TELEGRAM_ALLOWED_CHAT_IDS=123456789
ANTHROPIC_API_KEY=sk-ant-api03-...
DATA_DIR=~/.kenobot/data/main
```

**~/.kenobot/config/quick.env** — Fast, cheap responses:
```bash
PROVIDER=claude-api
MODEL=haiku
IDENTITY_FILE=identities/quick.md
TELEGRAM_BOT_TOKEN=<quick_bot_token>
TELEGRAM_ALLOWED_CHAT_IDS=123456789
ANTHROPIC_API_KEY=sk-ant-api03-...
DATA_DIR=~/.kenobot/data/quick
```

### 2. Create Identity Files

```bash
mkdir -p ~/.kenobot/config/identities
```

Each identity is a directory with SOUL.md, IDENTITY.md, and USER.md. See `~/.kenobot/config/identities/kenobot/` for an example. You can also use a single `.md` file for simpler setups.

### 3. Run

```bash
kenobot start --config ~/.kenobot/config/main.env &
kenobot start --config ~/.kenobot/config/quick.env &
```

## Data Isolation

Each instance stores data under its own `DATA_DIR`:

```
~/.kenobot/data/
  main/
    sessions/           # Main bot's conversations
    memory/             # Main bot's memory
    logs/               # Main bot's logs
    scheduler/          # Main bot's scheduled tasks
  quick/
    sessions/           # Quick bot's conversations
    memory/             # Quick bot's memory
    logs/               # Quick bot's logs
    scheduler/          # Quick bot's scheduled tasks
```

Instances are fully independent. If one crashes, the others keep running.

## Use Cases

| Instance | Provider | Model | Identity | Purpose |
|----------|----------|-------|----------|---------|
| Main | claude-api | opus | kenobot.md | Deep reasoning, complex tasks |
| Quick | claude-api | haiku | quick.md | Fast answers, notes, quick lookups |
| Designer | claude-api | sonnet | designer.md | UI/UX, creative work |

## Creating a Telegram Bot for Each Instance

Each instance needs its own Telegram bot:

1. Talk to [@BotFather](https://t.me/botfather)
2. `/newbot` → Choose a name and username
3. Copy the token to the instance's config file
4. Repeat for each instance

## Source

- [src/config.js](../src/config.js) — Config loading with `--config` flag
- [src/index.js](../src/index.js) — Component wiring
