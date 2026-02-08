# Memory

> Persistent memory across conversations. The bot remembers facts, preferences, and context using daily logs, a curated long-term memory file, and per-session working memory.

## Overview

KenoBot has a three-tier memory system:

| Tier | Tag | Scope | Persistence | Purpose |
|------|-----|-------|-------------|---------|
| **Global memory** | `<memory>` | All chats | Permanent | Long-term facts, preferences |
| **Chat memory** | `<chat-memory>` | Per chat | Permanent | Chat-specific context |
| **Working memory** | `<working-memory>` | Per session | Volatile | Current conversation state |

- **MEMORY.md**: Long-term curated facts. Human or agent-editable.
- **Daily logs** (`YYYY-MM-DD.md`): Append-only notes auto-extracted from responses.
- **Working memory** (`working/{sessionId}.md`): Current session scratchpad, auto-replaced on each update.

All are plain markdown files stored in `~/.kenobot/data/memory/`. Human-readable, zero dependencies.

## How It Works

### Auto-Extraction

The agent is instructed to wrap things worth remembering in `<memory>` tags:

```
User: I prefer concise answers, no long explanations.
Bot: Got it, I'll keep things brief. <memory>User preference: prefers concise responses</memory>
```

The memory extractor:
1. Parses `<memory>` tags from the LLM response
2. Strips them from the text sent to the user (they never see the tags)
3. Appends each memory to today's daily log (`~/.kenobot/data/memory/YYYY-MM-DD.md`)

### Context Injection

On every message, the context builder includes:
1. Long-term memory (`~/.kenobot/data/memory/MEMORY.md`) — always loaded
2. Recent daily logs (last N days, configurable) — loaded by recency
3. Instructions for the `<memory>` tag format

This gives the LLM continuity across conversations without explicit session management.

## Configuration

```bash
MEMORY_DAYS=3                   # How many days of recent notes to include in context (default: 3)
MEMORY_RETENTION_DAYS=30        # Days before daily logs are compacted into MEMORY.md (default: 30)
WORKING_MEMORY_STALE_DAYS=7     # Days before working memory is excluded from context (default: 7)
# Memory is stored in DATA_DIR/memory/ (default: ~/.kenobot/data/memory/)
```

## File Structure

```
~/.kenobot/data/memory/
  MEMORY.md                        # Long-term curated facts
  2026-02-07.md                    # Today's auto-extracted notes
  2026-02-06.md                    # Yesterday
  2026-02-05.md                    # Two days ago
  chats/telegram-123/MEMORY.md     # Per-chat long-term memory
  chats/telegram-123/2026-02-07.md # Per-chat daily notes
  working/telegram-123.md          # Working memory (volatile)
```

### MEMORY.md

Curated long-term memory. You can edit this directly:

```markdown
# KenoBot Memory

## User Preferences
- Prefers concise responses
- Primary language: Spanish, English for technical topics
- Timezone: America/Mexico_City

## Project Context
- Working on KenoBot in /workspaces/kenobot
- VPS: Hetzner 2vCPU/4GB ($4/month)

## Important Facts
- Birthday: March 15
- Favorite editor: VS Code
```

### Daily Logs

Auto-generated, append-only. One file per day:

```markdown
## 10:30 - User preference learned
User prefers concise responses

## 14:15 - Project context
Working on documentation for KenoBot
```

## Usage Examples

### The Bot Remembers Preferences

```
Day 1:
User: I prefer bullet points over paragraphs.
Bot: Noted! I'll use bullet points when possible.
     <memory>User preference: prefers bullet points over paragraphs</memory>

Day 2 (new conversation):
User: Summarize this article.
Bot: Here's the summary:
     - Point 1...
     - Point 2...
     (Uses bullet points because it remembers the preference)
```

### Manual Memory Editing

Edit `~/.kenobot/data/memory/MEMORY.md` directly to add or correct facts:

```bash
# Add a fact
echo "- Prefers dark mode" >> ~/.kenobot/data/memory/MEMORY.md

# The bot will use this in its next response
```

### Memory in Context

The system prompt includes memory like this:

```
## Memory
You have persistent memory across conversations. Use it wisely.

### How to remember things
When you learn something worth remembering, include it in your response:
<memory>Short title: fact to remember</memory>

### How to maintain working memory
<working-memory>
- Current topic/task being discussed
- Key decisions or facts from this conversation
- What's pending or next
</working-memory>

### Long-term memory
[Contents of MEMORY.md]

### Recent notes
[Contents of last 3 daily log files]

### Working memory (updated 2 hours ago)
[Contents of working/{sessionId}.md, if fresh]
```

## Working Memory

Working memory gives the bot a self-maintained scratchpad for the current conversation. Unlike `<memory>` (append to daily log), `<working-memory>` **replaces** the file entirely each time — it's always the current snapshot.

```
User: Let's compare EU AI Act vs US regulation.
Bot: Great, let's start with the EU approach...

     <working-memory>
     - Topic: EU AI Act vs US AI regulation comparison
     - Covered: EU risk classification tiers
     - Pending: US executive order details, enforcement comparison
     - Context: User preparing a presentation
     </working-memory>
```

### How It Differs from Other Memory Types

- `<memory>` → "User prefers Spanish" (permanent global fact)
- `<chat-memory>` → "This chat is about AI regulation" (permanent per-chat fact)
- `<working-memory>` → "We're comparing sections 3 and 4, already covered enforcement" (volatile session state)

### Staleness

Working memory includes its age when injected into context (e.g., "updated 2 hours ago", "updated 3 days ago"). Memory older than `WORKING_MEMORY_STALE_DAYS` (default: 7) is excluded. No cleanup cron needed — stale files are simply ignored and overwritten on next use.

### Configuration

```bash
WORKING_MEMORY_STALE_DAYS=7  # Days before working memory is excluded from context (default: 7)
```

## Compaction

Daily logs are **automatically compacted** on bot startup. Logs older than `MEMORY_RETENTION_DAYS` (default: 30) are processed:

1. Entries are extracted from old daily logs
2. Duplicates are detected via case-insensitive substring matching against MEMORY.md
3. Unique entries are appended to MEMORY.md under `## Compacted memories`
4. Old log files are deleted

This uses the **HeuristicCompactor** strategy — zero API cost, since memories are already pre-processed by the LLM (extracted from `<memory>` tags).

For the full compaction algorithm and architecture, see [MEMORY_COMPACTION.md](../../MEMORY_COMPACTION.md).

### Swappable Strategies

The compaction system uses a decorator + strategy pattern:

```
CompactingMemory (decorator) → wraps FileMemory
  └── HeuristicCompactor (current strategy, zero cost)
  └── LLMCompactor (future: uses provider to summarize)
```

The storage backend is also swappable — `FileMemory` implements `BaseMemory`, and future backends (e.g. SQLiteMemory) can implement the same interface.

## Maintenance

### MEMORY.md Curation

`MEMORY.md` grows as facts are added (manually or via compaction). Periodically review it to:
- Remove outdated information
- Consolidate duplicate entries
- Keep it under ~10KB for optimal context budget usage

A large MEMORY.md consumes context tokens on every message. If it exceeds ~10KB, consider splitting into sections and keeping only the most relevant facts in the main file.

## Source

- [src/agent/memory.js](../src/agent/memory.js) — FileMemory (filesystem storage)
- [src/agent/compacting-memory.js](../src/agent/compacting-memory.js) — CompactingMemory (decorator)
- [src/agent/heuristic-compactor.js](../src/agent/heuristic-compactor.js) — HeuristicCompactor (strategy)
- [src/agent/base-memory.js](../src/agent/base-memory.js) — BaseMemory (interface)
- [src/agent/memory-extractor.js](../src/agent/memory-extractor.js) — Memory tag parser
- [src/agent/chat-memory-extractor.js](../src/agent/chat-memory-extractor.js) — Chat memory tag parser
- [src/agent/working-memory-extractor.js](../src/agent/working-memory-extractor.js) — Working memory tag parser
- [src/agent/context.js](../src/agent/context.js) — Context injection (`_buildMemorySection`)
- [MEMORY_COMPACTION.md](../../MEMORY_COMPACTION.md) — Architecture documentation
