# Self-Improvement

> How the bot can propose and implement improvements to itself.

## Overview

KenoBot is designed to improve over time. It can:
- Propose new skills, workflows, and identity changes
- Work directly on its own codebase
- Create Pull Requests for code changes
- Learn from interactions and update its memory

## Levels of Self-Improvement

### 1. Memory & Learning (Always On)
The bot continuously learns through:
- **Memory tags**: `<memory>` tags in responses are extracted and saved
- **User preferences**: `<user>` tags update USER.md automatically
- **Daily logs**: Conversations and decisions are logged to memory files

No approval needed — this is core functionality.

### 2. Proposals (Requires Approval)
The bot can propose changes that need owner approval:

| Type | What it changes | How to approve |
|------|-----------------|----------------|
| `skill` | New capability plugin | `/approve <id>` |
| `workflow` | n8n automation | `/approve <id>` |
| `identity` | IDENTITY.md (expertise) | `/approve <id>` |
| `soul` | SOUL.md (personality) | `/approve <id>` |

**Workflow:**
1. Bot proposes via `approval` tool: `{ action: "propose", type: "skill", name: "weather" }`
2. Owner reviews: `/pending` → `/review abc123`
3. Owner decides: `/approve abc123` or `/reject abc123 "reason"`
4. If approved, change is activated immediately

### 3. Code Changes (Dev Mode + PR)
For changes to the bot's actual codebase:

1. **Enter dev mode**: `/dev kenobot <task>`
2. **Bot works on code** using Claude Code with full repo context
3. **Commit changes**: `/git commit "feat: add new feature"`
4. **Push branch**: `/git push`
5. **Create PR**: `/pr create "Add new feature"`
6. **Owner reviews & merges** via GitHub or `/pr merge <number>`

## Configuration

Enable self-improvement in your `.env`:

```bash
SELF_IMPROVEMENT=true    # Enable approval tool
WORKSPACE_DIR=~/.kenobot/data    # Where proposals are staged
PROJECTS_DIR=~/Workspaces        # Where code projects live (for /dev)
SSH_KEY_PATH=~/.ssh/id_ed25519   # For authenticated git push
```

## Safety Guardrails

1. **All proposals require explicit approval** — the bot cannot activate changes unilaterally
2. **Code changes go through PRs** — visible, reviewable, revertible
3. **Staging directory** — proposed changes live in `staging/` until approved
4. **No self-approval** — the bot cannot approve its own proposals
5. **Audit trail** — all proposals are logged with timestamps

## Example: Creating a New Tool

The bot can create entirely new tools:

```
User: I need a tool to check cryptocurrency prices

Bot: I'll create a crypto price tool for you.

[Bot creates src/tools/crypto.js in a branch]
[Bot commits and pushes]
[Bot creates PR]

Bot: I've created a PR for the new crypto tool: https://github.com/you/kenobot/pull/42
     Review it and merge when ready. After merging, restart the bot to load the new tool.
```

## Example: Proposing a Skill

For simpler additions that don't require code changes:

```
User: Can you add a skill for weather forecasts?

Bot: I'll propose a weather skill.

[Bot uses approval tool to propose skill]

Bot: I've proposed a weather skill. Review it with /review abc123 and approve with /approve abc123.
```

## Best Practices

1. **Start with proposals** — use the approval system for simple additions
2. **Use PRs for code** — keeps changes reviewable and revertible
3. **Review before approving** — always check `/review <id>` before approving
4. **Test in staging** — for complex skills, test before approving
5. **Keep identity changes small** — personality tweaks should be incremental

## Source

- [src/tools/approval.js](../../src/tools/approval.js) — Proposal management
- [src/tools/github.js](../../src/tools/github.js) — Git operations
- [src/tools/pr.js](../../src/tools/pr.js) — Pull Request management
- [src/tools/dev.js](../../src/tools/dev.js) — Development mode
