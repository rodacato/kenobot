# Memory System

> **A cognitive architecture for memory built on principles from neuroscience and cognitive psychology**
>
> *Sub-system of the [Cognitive System](README.md)*

## Table of Contents

1. [Overview](#overview)
2. [Conceptual Foundations](#conceptual-foundations)
3. [Architecture](#architecture)
4. [The Four Memory Types](#the-four-memory-types)
5. [File Structure](#file-structure)
6. [Core Components](#core-components)
7. [Memory Retrieval](#memory-retrieval)
8. [Memory Storage (Tags)](#memory-storage-tags)
9. [Integration with Agent Loop](#integration-with-agent-loop)
10. [API Reference](#api-reference)
11. [Testing](#testing)
12. [Configuration](#configuration)
13. [Advanced Topics](#advanced-topics)

---

## Overview

KenoBot's memory system implements a **four-tier memory architecture** inspired by human cognition:

```
┌─────────────────────────────────────┐
│  Working Memory (Scratchpad)        │  ← Current task context
├─────────────────────────────────────┤
│  Episodic Memory (Events)           │  ← What happened, when
├─────────────────────────────────────┤
│  Semantic Memory (Facts)            │  ← What I know (timeless)
├─────────────────────────────────────┤
│  Procedural Memory (Patterns)       │  ← How to behave
└─────────────────────────────────────┘
```

**Key Features:**
- ✅ **Four memory types** - Working, episodic, semantic, procedural (Atkinson-Shiffrin + Tulving model)
- ✅ **Selective retrieval** - Load only relevant memories (not everything)
- ✅ **Staleness tracking** - Working memory expires after 7 days
- ✅ **Scope separation** - Global facts vs per-chat context
- ✅ **Isolated components** - Each memory type is independently testable
- ✅ **Plain markdown** - Zero dependencies, human-readable

---

## Conceptual Foundations

### Human Memory Model (Atkinson-Shiffrin + Tulving)

KenoBot's memory is modeled after proven cognitive psychology:

```
SENSORY MEMORY (< 1 second)
    ↓ attention
WORKING MEMORY (7±2 items, seconds-minutes)
    ↓ consolidation
LONG-TERM MEMORY
    ├── DECLARATIVE (conscious)
    │   ├── Episodic (events: "yesterday we discussed X")
    │   └── Semantic (facts: "Adrian prefers Spanish")
    └── NON-DECLARATIVE (unconscious)
        └── Procedural (skills: "how to respond to errors")
```



### Memory Consolidation (Sleep Theory)

**Human sleep consolidates memory:**
- **NREM Stage 3:** Episodic → Semantic (facts extracted from events)
- **REM:** Procedural learning (patterns extracted from repetition)
- **Replay:** Reactivation of salient episodes (not all)
- **Homeostatic:** Prune weak connections (forgetting is a feature)

**KenoBot equivalent (Phase 2+):**
- **Sleep cycle (4am):** Consolidate daily episodes → semantic facts
- **Saliency filter:** Only process errors, successes, novel events (not all episodes)
- **Pattern extraction:** Repeated behaviors → procedural patterns
- **Memory pruning:** Archive old episodes, clear stale working memory

**Why not process everything?**
- Humans only consolidate ~10-15% of daily experiences
- Forgetting is a feature: prevents noise, maintains relevance
- Saves LLM cost (selective consolidation)


### Retrieval Cues (Context-Dependent Memory)

**Hallazgo clave:** Memory retrieval is better when retrieval context = encoding context.

**KenoBot implementation:**
- **Session context:** Each chat has its own episodic memory
- **Temporal cues:** "yesterday we talked about X" → search recent episodes
- **Semantic cues:** "my n8n project" → search facts tagged with "n8n"


---

## Architecture

### Component Hierarchy

```
MemorySystem (Facade)
├── WorkingMemory          # Session scratchpad (7-day staleness)
├── SemanticMemory         # Global facts (permanent)
├── EpisodicMemory         # Chat-specific events (temporal)
└── ProceduralMemory       # Learned patterns (Phase 4)
```

**Persistence Layer:**
```
MemoryStore (src/storage/memory-store.js)
└── Filesystem: data/memory/ and ~/.kenobot/memory/
```

**Key Design Principles:**
- **Single Responsibility:** Each memory type manages one kind of data
- **No Cross-Type Communication:** Each depends only on MemoryStore + logger
- **Clear Scopes:** Working (per-session), Episodic (per-chat), Semantic (global), Procedural (global)
- **Staleness Tracking:** Working memory includes age; returns null if > 7 days

### Isolation Guarantees

✅ **Memory is isolated from Identity**
- Separate directories (`memory/` vs `memory/identity/`)
- MemorySystem never calls IdentityManager methods
- Different lifecycles (identity: startup; memory: per-message)

✅ **Memory types are isolated from each other**
- WorkingMemory doesn't know about EpisodicMemory
- SemanticMemory doesn't know about ProceduralMemory
- Each has its own file I/O and retrieval logic

✅ **Retrieval is isolated (Phase 2)**
- RetrievalEngine reads from MemorySystem (no writes)
- Pluggable strategies (keyword → embeddings)
- Can be enabled/disabled via config

**Source:** Architecture exploration

---

## The Four Memory Types

### 1. Working Memory (Scratchpad)

**What:** Temporary context for current conversation/task.

**Analogy:** Human working memory - "what I'm thinking about right now"

**Scope:** Per-session

**Lifecycle:** 7 days (configurable). Returns null if older.

**Format:** JSON with hybrid structure:

```json
{
  "session": "telegram-123456789",
  "task": "Debugging n8n webhook 401 error",
  "context": [
    "User tried Bearer token in header - failed",
    "Trying query param ?token=X next"
  ],
  "pending": [
    "Check if webhook URL is correct",
    "Verify API key format"
  ],
  "notes": "User seems frustrated, mentioned might switch tools",
  "updated": "2026-02-13T18:00:00Z"
}
```

**Why hybrid?**
- Structured fields (`task`, `context`, `pending`) facilitate pattern extraction (Phase 3)
- `notes` free-form field captures nuance that doesn't fit structure

**Storage:** `~/.kenobot/memory/working/{sessionId}.json`


---

### 2. Episodic Memory (Events with Context)

**What:** Specific events/conversations with temporal context.

**Analogy:** Human episodic memory - "yesterday we discussed X"

**Scope:** Per-chat + shared global

**Lifecycle:** 30 days (after which compacted to semantic)

**Format:** Markdown daily logs

```markdown
---
timestamp: 2026-02-13T14:30:00Z
session: telegram-123456789
participants: [Adrian]
tags: [n8n, debugging, webhook, 401]
---

## Conversation about n8n webhook auth

Adrian was configuring webhook to receive GitHub events.
Webhook returned 401 Unauthorized. We tried:
1. Bearer token in header → failed
2. Query param ?token=X → worked

**Learning:** n8n webhooks expect auth in query params, not headers.
```

**Storage:**
- **Per-chat:** `~/.kenobot/memory/chats/{sessionId}/YYYY-MM-DD.md`
- **Shared:** `~/.kenobot/memory/YYYY-MM-DD.md` (cross-chat events)

**Why per-chat?**
- Isolates chat-specific context (debugging in chat A ≠ planning in chat B)
- Allows retrieval scoped to conversation


---

### 3. Semantic Memory (Timeless Facts)

**What:** General knowledge and facts (no temporal context).

**Analogy:** Human semantic memory - "I know that Adrian prefers Spanish"

**Scope:** Global (shared across all chats)

**Lifecycle:** Permanent (until manually deleted or compacted)

**Format:** Markdown

```markdown
# Facts

## About Adrian
- Name: Adrian
- Language: Spanish (primary), English (technical)
- Timezone: America/Mexico_City (CST/CDT)
- Communication style: Direct, no filler phrases

## About the Environment
- VPS: Hetzner 2vCPU/4GB/40GB (~$4/month)
- Tools: n8n, Telegram, Claude API
- Current project: KenoBot
```

**Storage:**
- **Long-term:** `~/.kenobot/memory/MEMORY.md` (curated)
- **Daily logs:** `~/.kenobot/memory/YYYY-MM-DD.md` (auto-extracted)

**Consolidation (Phase 2):**
- Daily logs → MEMORY.md after 30 days
- Deduplication (case-insensitive substring matching)
- Only salient facts (errors, successes, novel info)


---

### 4. Procedural Memory (Learned Patterns)

**What:** Behavioral patterns learned from repetition.

**Analogy:** Human procedural memory - "when I see X, I do Y"

**Scope:** Global

**Lifecycle:** Permanent (until manually removed)

**Format:** JSON patterns

```json
{
  "patterns": [
    {
      "id": "n8n_auth_401",
      "trigger": "n8n + 401 error",
      "response": "First check if webhook expects ?token= in query params",
      "confidence": 0.95,
      "usageCount": 5,
      "learnedFrom": "episodic/chats/telegram-123/2026-02-13.md"
    },
    {
      "id": "user_asks_impossible",
      "trigger": "request exceeds VPS capabilities",
      "response": "That won't work on 2vCPU/4GB. Better alternative: {X}",
      "confidence": 0.90,
      "usageCount": 12
    }
  ]
}
```

**Usage:** When trigger matches, inject suggested response in context.

**Storage:** `~/.kenobot/memory/procedural/patterns.json`

**Learning (Phase 3):**
- Sleep cycle detects repeated solutions in episodic memory
- Proposes new pattern with confidence score
- User approves → pattern added


---

## File Structure

### On-Disk Hierarchy

```
~/.kenobot/memory/
├── identity/                      # Identity system (separate)
│   ├── core.md
│   ├── rules.json
│   └── preferences.md
│
├── semantic/                      # Global facts (Phase 3+)
│   └── facts.md
│
├── procedural/                    # Learned patterns (Phase 4+)
│   └── patterns.json
│
├── chats/                         # Per-chat episodic memory
│   ├── telegram-123456789/
│   │   ├── MEMORY.md             # Chat-specific long-term
│   │   └── 2026-02-13.md         # Chat daily episodes
│   └── telegram-987654321/
│       └── ...
│
├── working/                       # Session scratchpad
│   ├── telegram-123456789.json
│   └── telegram-987654321.json
│
├── MEMORY.md                      # Global long-term facts
└── 2026-02-13.md                 # Global daily episodes
```

### Current State (Phase 1)

**Active:**
- `MEMORY.md` - Global long-term
- `YYYY-MM-DD.md` - Global daily logs
- `chats/{sessionId}/MEMORY.md` - Chat long-term
- `chats/{sessionId}/YYYY-MM-DD.md` - Chat daily logs
- `working/{sessionId}.json` - Working memory

**Placeholder (Phase 3+):**
- `semantic/facts.md` - Will consolidate from daily logs
- `procedural/patterns.json` - Will learn from episodes

---

## Core Components

### 1. MemorySystem (Facade)

**Purpose:** Single entry point for all memory operations.

**Public API:**
```javascript
class MemorySystem {
  // Semantic (global facts)
  async getLongTermMemory()                    // MEMORY.md
  async getRecentDays(days=3)                  // Recent daily logs
  async addFact(fact)                          // Append to daily log

  // Episodic (chat-specific)
  async getChatLongTermMemory(sessionId)       // chats/{id}/MEMORY.md
  async getChatRecentDays(sessionId, days)     // chats/{id}/YYYY-MM-DD.md
  async addChatFact(sessionId, fact)           // Append to chat daily log

  // Working (scratchpad)
  async getWorkingMemory(sessionId)            // Returns {content, updatedAt} or null
  async replaceWorkingMemory(sessionId, content)  // Full replace

  // Procedural (patterns - Phase 4)
  async getPatterns()                          // All patterns
  async matchPatterns(messageText)             // Find matching patterns

  // Compaction (Phase 2+)
  async listDailyLogs()
  async readDailyLog(filename)
  async writeLongTermMemory(content)
}
```

**Usage Example:**
```javascript
const memorySystem = new MemorySystem(memoryStore, { logger, workingStaleThreshold: 7 })

// Get global facts
const longTerm = await memorySystem.getLongTermMemory()
const recent = await memorySystem.getRecentDays(3)  // Last 3 days

// Get chat-specific
const chatLongTerm = await memorySystem.getChatLongTermMemory('telegram-123')
const chatRecent = await memorySystem.getChatRecentDays('telegram-123', 3)

// Get working memory (may return null if stale)
const working = await memorySystem.getWorkingMemory('telegram-123')
```

---

### 2. WorkingMemory

**Purpose:** Manages session scratchpad with staleness tracking.

**API:**
```javascript
class WorkingMemory {
  async get(sessionId)                 // Returns {content, updatedAt} or null if stale
  async replace(sessionId, content)    // Full replace, updates timestamp
  async clear(sessionId)               // Delete working memory
  async exists(sessionId)              // Check if exists and not stale
}
```

**Staleness Logic:**
```javascript
async get(sessionId) {
  const data = await this.store.getWorkingMemory(sessionId)
  if (!data) return null

  const age = Date.now() - new Date(data.updatedAt)
  const staleMs = this.staleThreshold * 24 * 60 * 60 * 1000

  if (age > staleMs) {
    return null  // Too old, ignore
  }

  return data
}
```

**File Format:**
```json
{
  "content": "Task: debugging webhook\nContext: tried Bearer token, failed",
  "updatedAt": "2026-02-13T18:00:00Z"
}
```

---

### 3. SemanticMemory

**Purpose:** Manages global facts (timeless knowledge).

**API:**
```javascript
class SemanticMemory {
  async getLongTerm()                  // MEMORY.md
  async getRecent(days)                // Last N daily logs
  async addFact(fact)                  // Append to today's log
  async writeLongTerm(content)         // Overwrite MEMORY.md (compaction)
}
```

**Daily Log Format:**
```markdown
## 14:30 - User preference learned
User prefers concise responses, no long explanations

## 16:45 - Project context
Working on KenoBot documentation in /workspaces/kenobot
```

---

### 4. EpisodicMemory

**Purpose:** Manages chat-specific events with temporal context.

**API:**
```javascript
class EpisodicMemory {
  async getChatLongTerm(sessionId)              // chats/{id}/MEMORY.md
  async getChatRecent(sessionId, days)          // Last N days of chat logs
  async addChatEpisode(sessionId, episode)      // Append to chat daily log

  async getSharedRecent(days)                   // Shared global episodes
  async addSharedEpisode(episode)               // Append to shared log
}
```

**Episode Format (with metadata):**
```markdown
---
timestamp: 2026-02-13T14:30:00Z
session: telegram-123456789
tags: [n8n, debugging]
---

## Episode title

Description of what happened...
```

---

### 5. ProceduralMemory (Phase 4)

**Purpose:** Manages learned behavioral patterns.

**API:**
```javascript
class ProceduralMemory {
  async getAll()                       // All patterns
  async match(messageText)             // Find matching patterns (Phase 4)
  async add(pattern)                   // Add new pattern
  async remove(patternId)              // Remove pattern
}
```

**Pattern Matching (Phase 4):**
```javascript
async match(messageText) {
  const patterns = await this.getAll()

  return patterns.filter(p => {
    const terms = p.trigger.split('+').map(t => t.trim())
    return terms.every(term => messageText.includes(term))
  })
}
```

---

## Memory Retrieval

### Selective Retrieval (Phase 2+)

**Problem:** Loading all memory on every message wastes tokens and increases cost.

**Solution:** Retrieve only relevant memories based on keywords/embeddings.

**Current (Phase 1):** Load everything (MEMORY.md + last 3 days)

**Phase 2:** Keyword-based selective retrieval
- Extract keywords from user message
- Search facts with keyword matching
- Return top N relevant facts (limit: 10)

**Phase 3:** LLM-based query expansion
- Use Haiku to expand keywords with synonyms
- Cache expansions to reduce cost

**Phase 4:** Embedding-based retrieval
- Generate embeddings for user message
- Vector search in semantic memory
- Return top N by cosine similarity


### RetrievalEngine (Phase 2+)

**Purpose:** Selectively retrieve relevant memories.

**API:**
```javascript
class RetrievalEngine {
  async retrieve(messageText, sessionId, options)
  // Returns: {
  //   facts: [...],          // Top N semantic facts
  //   episodes: [...],       // Top N relevant episodes
  //   patterns: [...],       // Matching procedural patterns
  //   confidence: 'high' | 'medium' | 'low' | 'none'
  // }
}
```

**Keyword Matching (Phase 2):**
```javascript
function extractKeywords(message) {
  return message
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3)  // Skip short words
}

function scoreFact(fact, keywords) {
  return keywords.filter(kw => fact.includes(kw)).length
}
```


---

## Memory Storage (Tags)

### Auto-Extraction via Tags

The LLM wraps memories in XML tags:

```
<memory>Short title: fact to remember</memory>
<chat-memory>Chat-specific context</chat-memory>
<working-memory>Current task state</working-memory>
```

**Post-processors extract and persist:**

```javascript
// memory-extractor.js
const memories = extractMemoryTags(response.content)
for (const memory of memories) {
  await memorySystem.addFact(memory)  // → YYYY-MM-DD.md
}

// chat-memory-extractor.js
const chatMemories = extractChatMemoryTags(response.content)
for (const memory of chatMemories) {
  await memorySystem.addChatFact(sessionId, memory)  // → chats/{id}/YYYY-MM-DD.md
}

// working-memory-extractor.js
const workingMemory = extractWorkingMemoryTag(response.content)
if (workingMemory) {
  await memorySystem.replaceWorkingMemory(sessionId, workingMemory)  // → working/{id}.json
}
```

**Tags are stripped before displaying to user.**

---

## Integration with Agent Loop

### Message Flow

```
Message arrives
    ↓
AgentLoop._handleMessage()
    ↓
ContextBuilder.build(sessionId, message)
    ↓
CognitiveSystem.buildContext(sessionId, messageText)
    ├─→ Check isBootstrapping
    │   └─→ If true: SKIP memory loading
    │
    └─→ If false: Load memory
        ├─→ memorySystem.getLongTermMemory()
        ├─→ memorySystem.getRecentDays(3)
        ├─→ memorySystem.getChatLongTermMemory(sessionId)
        ├─→ memorySystem.getChatRecentDays(sessionId, 3)
        └─→ memorySystem.getWorkingMemory(sessionId)
    ↓
system = {identity, tools, skills, memory}
messages = [history..., current_message]
    ↓
Provider.chat(messages, {system})
    ↓
Response (may include <memory>, <chat-memory>, <working-memory> tags)
    ↓
Post-processors
    ├─→ extractMemoryTags() → memorySystem.addFact()
    ├─→ extractChatMemoryTags() → memorySystem.addChatFact()
    └─→ extractWorkingMemoryTag() → memorySystem.replaceWorkingMemory()
```

### Context Injection

Memory is injected into system prompt:

```markdown
## Memory

### Long-term memory
[MEMORY.md content]

### Recent notes (last 3 days)
[2026-02-11.md]
[2026-02-12.md]
[2026-02-13.md]

### Chat-specific memory
[chats/telegram-123/MEMORY.md]
[chats/telegram-123/2026-02-13.md]

### Working memory (updated 2 hours ago)
[working/telegram-123.json content]
```

**Token budget:**
- MEMORY.md: ~1000 tokens
- Daily logs (3 days): ~500 tokens
- Chat memory: ~300 tokens
- Working memory: ~200 tokens
- **Total:** ~2000 tokens

---

## API Reference

### MemorySystem

```javascript
const memorySystem = new MemorySystem(memoryStore, {
  logger,
  workingStaleThreshold: 7  // days
})

// Semantic
await memorySystem.getLongTermMemory()
await memorySystem.getRecentDays(days)
await memorySystem.addFact(fact)
await memorySystem.writeLongTermMemory(content)

// Episodic
await memorySystem.getChatLongTermMemory(sessionId)
await memorySystem.getChatRecentDays(sessionId, days)
await memorySystem.addChatFact(sessionId, fact)

// Working
await memorySystem.getWorkingMemory(sessionId)
await memorySystem.replaceWorkingMemory(sessionId, content)

// Procedural
await memorySystem.getPatterns()
await memorySystem.matchPatterns(messageText)
```

### WorkingMemory

```javascript
const workingMemory = new WorkingMemory(memoryStore, { staleThreshold: 7 })

await workingMemory.get(sessionId)          // {content, updatedAt} or null
await workingMemory.replace(sessionId, content)
await workingMemory.clear(sessionId)
await workingMemory.exists(sessionId)
```

### SemanticMemory

```javascript
const semanticMemory = new SemanticMemory(memoryStore)

await semanticMemory.getLongTerm()          // MEMORY.md
await semanticMemory.getRecent(days)        // Daily logs
await semanticMemory.addFact(fact)          // Append to today
await semanticMemory.writeLongTerm(content) // Overwrite MEMORY.md
```

### EpisodicMemory

```javascript
const episodicMemory = new EpisodicMemory(memoryStore)

await episodicMemory.getChatLongTerm(sessionId)
await episodicMemory.getChatRecent(sessionId, days)
await episodicMemory.addChatEpisode(sessionId, episode)
await episodicMemory.getSharedRecent(days)
await episodicMemory.addSharedEpisode(episode)
```

---

## Testing

### Test Coverage

**Memory System Tests: 133 tests passing**

```
test/cognitive/memory/
├── memory-system.test.js        (17 tests) ✓
├── working-memory.test.js       (11 tests) ✓
├── semantic-memory.test.js      (9 tests) ✓
├── episodic-memory.test.js      (8 tests) ✓
└── procedural-memory.test.js    (12 tests) ✓
```

**Additional:**
```
test/agent/memory-extractor.test.js          (11 tests) ✓  [Tag extraction]
test/agent/chat-memory-extractor.test.js     (10 tests) ✓  [Chat tag extraction]
test/agent/working-memory-extractor.test.js  (9 tests) ✓   [Working tag extraction]
test/storage/memory-store.test.js            (11 tests) ✓  [MemoryStore]
test/e2e/features/memory.test.js             (10 tests) ✓  [End-to-end]
```

### Key Test Scenarios

**MemorySystem:**
- ✓ Initialize all 4 memory types
- ✓ Delegate to correct memory type
- ✓ Handle null returns gracefully

**WorkingMemory:**
- ✓ Get working memory with staleness check
- ✓ Return null for stale memory (> 7 days)
- ✓ Replace working memory with new content
- ✓ Clear working memory

**SemanticMemory:**
- ✓ Get long-term memory (MEMORY.md)
- ✓ Get recent days (last N daily logs)
- ✓ Add fact to today's log
- ✓ Write long-term memory (compaction)

**EpisodicMemory:**
- ✓ Get chat-specific long-term
- ✓ Get chat-specific recent days
- ✓ Add chat-specific episode
- ✓ Get shared episodes

**ProceduralMemory:**
- ✓ Get all patterns
- ✓ Add valid pattern
- ✓ Remove pattern
- ✓ Validate pattern fields

---

## Configuration

### Environment Variables

```bash
# Memory settings
MEMORY_DAYS=3                      # Days of recent notes to include (default: 3)
MEMORY_RETENTION_DAYS=30           # Days before compaction (default: 30)
WORKING_MEMORY_STALE_DAYS=7        # Days before working memory expires (default: 7)

# Retrieval (Phase 2+)
USE_RETRIEVAL=false                # Enable selective retrieval (default: false)
RETRIEVAL_LIMIT_FACTS=10           # Max facts to retrieve (default: 10)
RETRIEVAL_LIMIT_EPISODES=3         # Max episodes to retrieve (default: 3)

# Storage
MEMORY_DIR=~/.kenobot/memory       # Memory directory (default)
DATA_DIR=~/.kenobot/data           # Data directory (default)
```

---

## Advanced Topics

### Memory Compaction (Phase 2)

**Goal:** Consolidate daily logs into MEMORY.md after 30 days.

**Process:**
1. Find daily logs older than retention period
2. Extract entries
3. Deduplicate against MEMORY.md (substring matching)
4. Append unique entries to MEMORY.md
5. Delete old log files

**Strategies:**
- **Heuristic** (Phase 1): Simple deduplication, zero cost
- **LLM-based** (Phase 2): Use Haiku to summarize + merge


### Memory Pruning (Phase 3)

**Working Memory:**
- Delete files older than 7 days
- Or move to archive

**Episodic Memory:**
- Compress episodes older than 30 days to summaries
- Move to archive after 90 days

**Semantic Memory:**
- Human curation (no automatic deletion)

### Selective Retrieval with Embeddings (Phase 4)

**Current:** Keyword matching (regex)

**Future:** Embedding-based search
```javascript
// Generate embedding for user message
const embedding = await getEmbedding(userMessage)

// Search vector DB
const results = await vectorDB.search(embedding, limit: 10)

// Return most similar facts
return results.map(r => r.content)
```

**Vector DB options:**
- Pinecone (cloud)
- Qdrant (self-hosted)
- ChromaDB (embedded)


### Multi-Chat Memory Sharing

**Problem:** Learn in one chat, use in another.

**Solution:** Semantic memory is global
- Facts learned in any chat → `MEMORY.md`
- Available in all chats

**Episodic memory is isolated:**
- Chat A episodes → `chats/telegram-A/`
- Chat B episodes → `chats/telegram-B/`
- No cross-contamination


### Testing Memory System

```bash
# Reset memory only (keep identity)
kenobot reset --memory --yes

# This deletes:
# - memory/YYYY-MM-DD.md (daily logs)
# - memory/chats/ (all chat memory)
# - memory/working/ (all working memory)
# - memory/procedural/ (learned patterns)

# Preserves:
# - memory/MEMORY.md (long-term facts)
# - memory/identity/ (identity files)

# Reset everything
kenobot reset --all --yes
```

---

## Summary

KenoBot's memory system is a **cognitive architecture** built on:

✅ **Neuroscience:** Atkinson-Shiffrin + Tulving memory model
✅ **Psychology:** Context-dependent retrieval, consolidation theory
✅ **Architecture:** Clean isolation, four independent memory types
✅ **Efficiency:** Selective retrieval, staleness tracking, compaction
✅ **Testing:** 133 tests covering all components

**Key Innovation:** **Four-tier memory** (working, episodic, semantic, procedural) with **selective retrieval** and **staleness tracking**.

**See also:**
- [Cognitive System](README.md) — Parent bounded context
- [Identity System](identity.md) — Bot personality and preferences
