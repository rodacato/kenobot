# KenoBot

Personal AI assistant. The brain that orchestrates, reasons, and gets things done.

```
Telegram (UI) <-> KenoBot (Brain) <-> n8n (Nervous System)
                       |
                  Claude / Gemini
```

## What Is This

KenoBot is a private AI assistant built for a single user. It's not a framework, not a platform, not open source infrastructure. It's a personal tool that:

- **Thinks** using Claude (primary) and Gemini (secondary)
- **Talks** through Telegram
- **Acts** through n8n workflows
- **Remembers** across conversations via structured memory files
- **Improves** itself over time

## Architecture

**Brain + Nervous System model:**

- **KenoBot** handles reasoning, decisions, conversation, and context
- **n8n** handles automation, scheduling, triggers, and integrations
- KenoBot can create and trigger n8n workflows autonomously
- n8n can call KenoBot when a decision requires thinking

### Constraints by Design

| Resource | Limit |
|----------|-------|
| Server | Hetzner VPS (2vCPU, 4GB RAM, 40GB storage) |
| Budget | ~$4/month infrastructure |
| LLMs | Claude (primary), Gemini (secondary) — both paid externally |
| Interface | Telegram |

Everything is designed around these constraints. If it doesn't fit on this box, it doesn't ship.

## Project Structure

```
kenobot/
  CLAUDE.md            # Entry point for AI agents
  AGENTS.md            # Agent modes and behavior configuration
  IDENTITY.md          # KenoBot personality, values, and constraints
  heartbeat.md         # Current status and active tasks
  memory/              # Persistent context across sessions
  skills/              # Pluggable capabilities
  workflows/           # n8n workflow definitions
  config/              # Configuration files
  src/                 # Source code
```

## Identity

KenoBot has its own digital identity under **obiwan-kenobot** — separate GitHub, email, and social presence. Casual, competent, brutally honest. Think a Star Wars-flavored colleague who actually knows what they're doing.

## Philosophy

1. Working software over perfect software
2. Simplicity over features
3. Transparency over magic
4. Privacy over convenience
5. Autonomy with accountability

## Inspiration

This project was inspired by others who are building personal AI assistants their own way:

- **[OpenClaw](https://github.com/openclaw/openclaw)** — A self-hosted personal AI assistant that connects to messaging platforms like WhatsApp, Telegram, and Slack with a local control plane
- **[Claudio](https://github.com/edgarjs/claudio)** — An adapter that tunnels Claude Code CLI through Telegram for secure remote interaction
- **[nanobot](https://github.com/HKUDS/nanobot)** — An ultra-lightweight personal AI agent (~3,400 lines of Python) proving you don't need bloat to build something useful

Each takes a different approach, but they share the same spirit: personal tools built for real use, not for show.

## Private Project

This is a personal tool, not a product. No issues, no PRs, no roadmap. Just a developer and his bot figuring things out.

---

*"Hello there."* — KenoBot, probably
