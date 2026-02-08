# Memory

> Persistent memory across conversations. The bot remembers facts, preferences, and context using daily logs and a curated long-term memory file.

## Overview

KenoBot has a two-tier memory system:

- **MEMORY.md**: Long-term curated facts. Human or agent-editable.
- **Daily logs** (`YYYY-MM-DD.md`): Append-only notes auto-extracted from responses.

Both are plain markdown files stored in `~/.kenobot/data/memory/`. Human-readable, zero dependencies.

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
MEMORY_DAYS=3              # How many days of recent notes to include in context (default: 3)
MEMORY_RETENTION_DAYS=30   # Days before daily logs are compacted into MEMORY.md (default: 30)
# Memory is stored in DATA_DIR/memory/ (default: ~/.kenobot/data/memory/)
```

## File Structure

```
~/.kenobot/data/memory/
  MEMORY.md         # Long-term curated facts
  2026-02-07.md     # Today's auto-extracted notes
  2026-02-06.md     # Yesterday
  2026-02-05.md     # Two days ago
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

### Long-term memory
[Contents of MEMORY.md]

### Recent notes
[Contents of last 3 daily log files]
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
- [src/agent/memory-extractor.js](../src/agent/memory-extractor.js) — Tag parser
- [src/agent/context.js](../src/agent/context.js) — Context injection (`_buildMemorySection`)
- [MEMORY_COMPACTION.md](../../MEMORY_COMPACTION.md) — Architecture documentation
