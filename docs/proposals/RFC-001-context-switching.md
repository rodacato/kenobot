# RFC-001: Context Switching

> **Status:** Draft  
> **Author:** KenoBot  
> **Created:** 2026-02-11  
> **Last Updated:** 2026-02-11

---

## Summary

A context switching system that allows KenoBot to operate in different "modes" depending on what the user is working on. Each context has its own personality adjustments, memory, allowed actions, and workspace configuration.

---

## Problem Statement

### The User's Reality

Many professionals work across multiple domains simultaneously:
- Personal projects and learning
- Company A (client work, consulting)
- Company B (full-time job)
- Side projects

Each domain has:
- **Different conventions** — coding standards, documentation formats, communication styles
- **Different privacy requirements** — company secrets shouldn't mix
- **Different tools and workflows** — one project uses Ruby, another uses Node
- **Different people and terminology** — stakeholders, internal jargon

### Current Pain Points

1. **Manual context switching** — Users must remember to signal which project they're discussing ("Monato: can you review this PR?")

2. **Memory contamination** — The bot either remembers everything (privacy risk) or nothing (loses valuable context each session)

3. **Convention confusion** — The bot might suggest patterns from Project A while working on Project B

4. **Cognitive overhead** — Users spend mental energy managing the bot instead of the bot managing itself

5. **All-or-nothing privacy** — No granular control over what the bot can remember per project

### The Ideal Experience

```
User: /context monato
Bot: 🔄 Switched to Monato

     I remember:
     • DDD architecture with hexagonal layers
     • FIP-023 was approved last week
     • You're working on the payments module
     
     Workspace: ~/Workspace/monato-api
     
     What are we working on?

User: Review the changes in the payments service

Bot: [Reviews code knowing the project's conventions, architecture decisions, 
     and recent context — without mixing in unrelated information]
```

---

## Proposed Solution

### Core Concept: Contexts

A **context** is a named configuration that defines:
- How the bot behaves (tone, conventions)
- What the bot remembers (scoped memory)
- Where the bot works (workspace paths)
- What the bot can do (allowed/restricted actions)

### User Experience

#### Switching Contexts

```
/context                    → Show current context + list available
/context personal           → Switch to personal context
/context monato            → Switch to monato context  
/context --new acme        → Create new context interactively
/context --edit monato     → Edit context configuration
/context --delete oldproj  → Delete a context (with confirmation)
```

#### Context Indicator

Every response subtly indicates the active context:

```
[monato] Sure, I'll review that PR...
```

Or in Telegram, using a colored emoji:
```
🔵 Sure, I'll review that PR...     (personal)
🟢 Sure, I'll review that PR...     (monato)
🟡 Sure, I'll review that PR...     (amtelser)
```

#### Automatic Context Detection (Optional)

If enabled, the bot can suggest context switches:

```
User: Can you check the FIP for the new payment flow?

Bot: That sounds like Monato work. Switch to monato context?
     [Yes] [No, stay in personal]
```

Or via workspace detection:

```
User: /dev monato-api check the tests

Bot: You're working in monato-api. Switch to monato context?
     [Yes] [No]
```

#### Context-Aware Memory

Each context has isolated memory:

```
User: /memory search payments

Bot: Found in [monato] context:
     • FIP-023: Payment retry logic (2026-02-01)
     • Decision: Use idempotency keys (2026-01-15)
     
     No results in [personal] context.
     
     Search all contexts? [Yes] [No]
```

### File Structure

```
~/.kenobot/
├── config/
│   └── .env
├── data/
│   ├── sessions/           # Chat history (shared)
│   └── logs/               # System logs (shared)
│
└── contexts/
    ├── _default/           # Fallback when no context active
    │   ├── CONTEXT.md      # Context definition
    │   └── memory/
    │       └── MEMORY.md
    │
    ├── personal/
    │   ├── CONTEXT.md      # How bot behaves here
    │   ├── memory/
    │   │   ├── MEMORY.md   # Long-term memory for this context
    │   │   └── 2026-02-11.md
    │   └── workspace/      # Files created in this context
    │
    ├── monato/
    │   ├── CONTEXT.md
    │   ├── memory/
    │   │   └── MEMORY.md
    │   └── workspace/
    │
    └── amtelser/
        ├── CONTEXT.md
        ├── memory/
        │   └── MEMORY.md
        └── workspace/
```

### CONTEXT.md Format

```markdown
# Context: Monato

## About
Fintech startup building payment infrastructure.
Ruby on Rails, DDD, Hexagonal Architecture.

## Behavior

### Tone
Professional but direct. Spanish preferred, English for code.

### Conventions
- Commits: Conventional Commits format
- Specs: FIPs (Finco Improvement Proposals) in docs/fips/
- Architecture: Domain layer → Application layer → Infrastructure
- Testing: RSpec, minimum 80% coverage

### When reviewing code
- Check for DDD violations (business logic in controllers)
- Verify idempotency on payment operations
- Flag missing specs for new features

## Memory Rules

### Remember
- Architecture decisions and rationale
- FIP numbers and their status
- Team members and their roles
- Technical debt items
- Meeting decisions

### Never Remember
- Customer data or PII
- API keys, tokens, credentials
- Financial amounts or transaction details
- Anything marked [confidential]

## Workspaces
- Code: ~/Workspace/monato-api
- Docs: ~/Workspace/monato-docs

## Tools

### Enabled
- /dev monato-api
- /git (within monato workspaces)
- /pr

### Disabled
- /n8n (not used in this project)

## Quick Commands
- `/fip <number>` → Open FIP document
- `/arch` → Show architecture diagram
- `/team` → List team members

## Links
- GitHub: https://github.com/monato/api
- Docs: https://docs.monato.io
- Slack: #monato-dev
```

### Context Lifecycle

#### Creation

```
User: /context --new clientx

Bot: Let's set up a new context: clientx

     1. What's this project about? (one line)
     > E-commerce platform for luxury goods
     
     2. What's the tech stack?
     > Next.js, TypeScript, Prisma, PostgreSQL
     
     3. Any specific conventions I should follow?
     > Use conventional commits, components in PascalCase
     
     4. What can I remember about this project?
     > Architecture decisions, component structure, team members
     
     5. What should I never remember?
     > Customer data, pricing, inventory numbers
     
     6. Where's the code?
     > ~/Workspace/clientx
     
     ✅ Context 'clientx' created!
     
     I've generated a CONTEXT.md for you. 
     Want to review it? [Yes] [No, looks good]
```

#### Editing

Users can edit CONTEXT.md directly in any editor, or:

```
User: /context --edit monato

Bot: What do you want to change?
     1. Behavior/tone
     2. Memory rules
     3. Workspaces
     4. Quick commands
     5. Open CONTEXT.md in editor
     
User: 5

Bot: Opening ~/.kenobot/contexts/monato/CONTEXT.md in your editor...
```

#### Deletion

```
User: /context --delete oldproject

Bot: ⚠️ This will delete:
     - Context configuration
     - 23 memory entries
     - 5 workspace files
     
     The chat history will NOT be deleted.
     
     Type 'delete oldproject' to confirm:

User: delete oldproject

Bot: ✅ Context 'oldproject' deleted.
     Switched to 'personal' context.
```

### Session Persistence

The active context persists across sessions:

```
[Session ends]

[Next day, new session]

Bot: Good morning! You were working in the [monato] context.
     Last activity: Reviewing PR #142 for payment retry logic.
     
     Continue here or switch context?
```

### Cross-Context Operations

Sometimes users need to reference other contexts:

```
[In monato context]

User: That pattern we used in the amtelser project for caching, 
      can we apply it here?

Bot: Let me check the amtelser context...
     
     Found: Redis caching layer with TTL-based invalidation (2026-01-20)
     
     Yes, that pattern could work. In Monato's architecture, 
     it would go in the Infrastructure layer. Want me to draft it?
```

### Default Context

When no context is explicitly selected:

1. **First message of day** → Ask which context to use
2. **Ambiguous message** → Use `_default` context or ask
3. **Clear signals** → Auto-suggest (e.g., mentions project name)

Configuration option:
```bash
# .env
DEFAULT_CONTEXT=personal           # Always start here
# or
DEFAULT_CONTEXT=ask               # Always ask on first message
# or  
DEFAULT_CONTEXT=auto              # Try to detect, ask if unsure
```

---

## Implementation

### Phase 1: Core Context Switching

**Files to create:**
- `src/context/manager.js` — Context loading, switching, persistence
- `src/context/loader.js` — Parse CONTEXT.md files
- `src/tools/context.js` — `/context` command
- `templates/contexts/_default/CONTEXT.md` — Default context template

**Changes to existing:**
- `src/agent/loop.js` — Inject context into prompt
- `src/agent/context.js` — Load context-specific MEMORY.md
- `src/agent/memory.js` — Scope memory operations to active context

**Effort:** 8-12 hours

### Phase 2: Context-Aware Memory

**Changes:**
- Memory paths scoped to `contexts/{name}/memory/`
- Memory search can filter by context or search all
- Memory extraction respects "Never Remember" rules

**Effort:** 4-6 hours

### Phase 3: UX Polish

**Features:**
- Context indicator in responses
- Auto-detection suggestions
- Interactive context creation wizard
- Context-specific quick commands

**Effort:** 6-8 hours

### Phase 4: Advanced Features

**Features:**
- Cross-context search
- Context templates (clone a context structure)
- Context export/import (share setups)
- Per-context tool restrictions

**Effort:** 8-12 hours

---

## Migration Path

For users with existing vault-based setups:

### Before
```
vaults/
├── neural-noodle/      # Personal
├── grimoire-monato/    # Work 1
└── grimoire-amtelser/  # Work 2
```

### Migration Command

```
User: /context --migrate-from-vaults

Bot: I found 3 potential contexts to migrate:
     
     1. neural-noodle → personal
        Path: /root/workspace/vaults/neural-noodle
        
     2. grimoire-monato → monato  
        Path: /root/workspace/vaults/grimoire-of-monato
        
     3. grimoire-amtelser → amtelser
        Path: /root/workspace/vaults/grimoire-of-amtelser
     
     For each, I'll create:
     - CONTEXT.md (you'll customize)
     - Link to existing vault as workspace
     - Empty MEMORY.md (you choose what to seed)
     
     Proceed? [Yes] [No]
```

### After
```
~/.kenobot/contexts/
├── personal/
│   ├── CONTEXT.md
│   └── memory/
├── monato/
│   ├── CONTEXT.md
│   └── memory/
└── amtelser/
    ├── CONTEXT.md
    └── memory/

# Vaults remain where they are, linked as workspaces
```

---

## User Stories

### Story 1: The Consultant

> "I work with 3 different clients. Each has their own codebase, conventions, and confidentiality requirements. I need to switch between them without mixing context or leaking information."

**Solution:** Create a context per client. Each has isolated memory. The bot knows Client A's architecture without accidentally referencing Client B's patterns.

### Story 2: The Side-Project Developer

> "I have my day job (serious, professional) and my side projects (experimental, casual). I want different bot personalities for each."

**Solution:** Work context is professional and follows strict conventions. Personal context is casual, allows experimentation, and remembers random ideas.

### Story 3: The Team Lead

> "I work on multiple projects for the same company. They share some conventions but have different tech stacks and team members."

**Solution:** Create contexts that inherit from a base company context. Share conventions, customize per-project specifics.

### Story 4: The Privacy-Conscious User

> "I want to use the bot for work but I'm worried about sensitive information being remembered and surfacing later."

**Solution:** Configure "Never Remember" rules strictly. Enable confirmation before saving any memory in work contexts. Audit memory periodically.

---

## Open Questions

1. **Should contexts support inheritance?** (e.g., `monato` inherits from `work-base`)

2. **How to handle context in group chats?** (Multiple users, different contexts?)

3. **Should context switching require confirmation?** (Prevent accidental switches)

4. **Per-context model selection?** (Use cheaper model for simple contexts)

5. **Context-specific system prompts?** (Beyond CONTEXT.md, actual prompt injection)

---

## Success Metrics

- **Reduced friction:** No more manual prefixes in messages
- **Better memory:** Relevant context available without loading everything
- **Privacy confidence:** Users trust context isolation
- **Faster onboarding:** New project setup in <2 minutes

---

## Appendix: Full CONTEXT.md Schema

```yaml
# CONTEXT.md frontmatter (optional, for tooling)
---
name: monato
emoji: 🟢
created: 2026-02-11
updated: 2026-02-11
---

# Context: {name}

## About
{Free-form description of what this context is for}

## Behavior

### Tone
{How the bot should communicate}

### Language
{Preferred language(s)}

### Conventions
{Coding standards, documentation formats, etc.}

## Memory Rules

### Remember
{List of things safe to persist}

### Never Remember  
{List of things that must not be saved}

### Ask Before Remembering
{List of things that need confirmation}

## Workspaces
{Paths to code, docs, resources}

## Tools

### Enabled
{Tools available in this context}

### Disabled
{Tools blocked in this context}

## Quick Commands
{Context-specific shortcut commands}

## Links
{Relevant URLs for quick reference}

## Notes
{Any additional instructions or reminders}
```

---

*This RFC was created during the KenoBot migration from OpenClaw. It addresses real pain points experienced with multi-project workflows.*
