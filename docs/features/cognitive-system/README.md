# Cognitive System

> **The brain of KenoBot — how the bot thinks, remembers, and develops personality**
>
> Design rationale and research notes are in `docs/design/`.

## Table of Contents

1. [Overview](#overview)
2. [Conceptual Foundations](#conceptual-foundations)
3. [Architecture](#architecture)
4. [Sub-Systems](#sub-systems)
5. [File Structure](#file-structure)
6. [Integration with Agent Loop](#integration-with-agent-loop)
7. [API Reference](#api-reference)
8. [Testing](#testing)
9. [Configuration](#configuration)
10. [Relationship to Nervous System](#relationship-to-nervous-system)

---

## Overview

The Cognitive System is KenoBot's **brain** — a bounded context (`src/cognitive/`) that orchestrates everything the bot knows, remembers, and learns. It manages four sub-systems:

```
┌─────────────────────────────────────────────┐
│              Cognitive System                │
│              (CognitiveSystem facade)        │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Memory       │  │  Identity            │ │
│  │  System       │  │  System              │ │
│  │               │  │                      │ │
│  │  working      │  │  core personality    │ │
│  │  episodic     │  │  behavioral rules    │ │
│  │  semantic     │  │  learned preferences │ │
│  │  procedural   │  │  bootstrap           │ │
│  └──────────────┘  └──────────────────────┘ │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │  Retrieval    │  │  Consolidation       │ │
│  │  Engine       │  │                      │ │
│  │               │  │  sleep cycle         │ │
│  │  keyword      │  │  memory pruning      │ │
│  │  confidence   │  │  error analysis      │ │
│  └──────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Key Features:**
- **Four-tier memory** — Working, episodic, semantic, procedural (Atkinson-Shiffrin + Tulving)
- **Modular identity** — Core personality, behavioral rules, learned user preferences
- **Selective retrieval** — Keyword + confidence-based memory recall
- **Conversational bootstrap** — Natural onboarding through observation
- **Memory consolidation** — Sleep cycle, pruning, error analysis

---

## Conceptual Foundations

### Cognitive Psychology

The Cognitive System draws from established models in cognitive psychology and neuroscience:

| Theory | Application |
|--------|-------------|
| **Atkinson-Shiffrin** (1968) | Three-stage memory model: sensory → working → long-term |
| **Tulving** (1972) | Distinction between episodic (events) and semantic (facts) memory |
| **Big Five** personality | Bot personality dimensions (openness, conscientiousness, etc.) |
| **Self-Schema Theory** | Immutable core identity that defines who the bot is |
| **Attachment Theory** | Critical period learning during conversational bootstrap |
| **Context-Dependent Memory** | Better retrieval when recall context matches encoding context |

### The Brain Metaphor

The Cognitive System is the **brain** in KenoBot's biological metaphor. The [Nervous System](../nervous-system/) is how the brain communicates with the body:

```
Sensory input (Channels)
    ↓ via Nervous System
Brain (Cognitive System)
    ├── What do I remember? (Memory)
    ├── Who am I? (Identity)
    ├── What's relevant? (Retrieval)
    └── What should I consolidate? (Consolidation)
    ↓ via Nervous System
Motor output (Channels)
```

---

## Architecture

### Facade Pattern

`CognitiveSystem` (`src/cognitive/index.js`) is the single entry point, following the same pattern as `NervousSystem`:

```javascript
const cognitive = new CognitiveSystem(config, memoryStore, provider, { logger })

// Build context for a message (memory + identity)
const context = await cognitive.buildContext(sessionId, messageText)

// Save extracted memories
await cognitive.saveMemory(sessionId, memoryTags)

// Access sub-systems directly
const memory = cognitive.getMemorySystem()
const identity = cognitive.getIdentityManager()
```

### Component Hierarchy

```
CognitiveSystem (Facade)
├── MemorySystem (4-tier memory)
│   ├── WorkingMemory          — Session scratchpad (7-day staleness)
│   ├── EpisodicMemory         — Chat-specific events (temporal)
│   ├── SemanticMemory         — Global facts (permanent)
│   └── ProceduralMemory       — Learned patterns
│
├── IdentityManager (Personality)
│   ├── CoreLoader             — Immutable personality (cached)
│   ├── RulesEngine            — Behavioral guidelines (cached)
│   ├── PreferencesManager     — Learned user preferences (fresh read)
│   ├── BootstrapOrchestrator  — State machine for onboarding
│   └── ProfileInferrer        — LLM-based style detection
│
├── RetrievalEngine (Selective recall)
│   ├── KeywordMatcher         — Extract and match keywords
│   └── ConfidenceScorer       — Score retrieval quality
│
└── Consolidation (Maintenance)
    ├── SleepCycle             — Scheduled memory consolidation
    ├── MemoryPruner           — Clean stale data
    └── ErrorAnalyzer          — Learn from errors
```

### Isolation Guarantees

Each sub-system is independently testable:

- **Memory is isolated from Identity** — Separate directories, no cross-calls, different lifecycles
- **Memory types are isolated from each other** — Working doesn't know about Episodic
- **Retrieval is read-only** — Reads from Memory, never writes
- **Consolidation is async** — Runs on schedule, doesn't block message processing

---

## Sub-Systems

### Memory System

Four-tier memory architecture inspired by human cognition:

| Memory Type | Scope | Lifecycle | Purpose |
|-------------|-------|-----------|---------|
| **Working** | Per-session | 7 days | Current task context (scratchpad) |
| **Episodic** | Per-chat | 30 days | What happened, when (events) |
| **Semantic** | Global | Permanent | What I know (facts) |
| **Procedural** | Global | Permanent | How to behave (patterns) |

**Deep dive:** [Memory System](memory.md)

### Identity System

Three-layer identity architecture:

| Layer | Mutability | Content |
|-------|-----------|---------|
| **Core** | Immutable | Who the bot is, values, constraints |
| **Rules** | Static | Behavioral guidelines, forbidden patterns |
| **Preferences** | Dynamic | Learned user preferences, communication style |

Includes a **conversational bootstrap** that learns user preferences through natural observation rather than questionnaires.

**Deep dive:** [Identity System](identity.md)

### Retrieval Engine

Selective memory recall to avoid loading everything on every message:

- **Keyword extraction** from user message
- **Confidence scoring** (high/medium/low/none)
- **Limits** — Configurable max facts, episodes, and procedures
- **Fallback** — Full memory load when retrieval is disabled

### Consolidation

Background maintenance (runs on schedule, not per-message):

- **Sleep cycle** — Consolidates daily episodes into semantic facts
- **Memory pruning** — Cleans stale working memory, archives old episodes
- **Error analysis** — Extracts learnings from repeated errors

---

## File Structure

```
src/cognitive/
  index.js                          — CognitiveSystem facade
  memory/
    memory-system.js                — MemorySystem facade
    working-memory.js               — Session scratchpad
    episodic-memory.js              — Chat-specific events
    semantic-memory.js              — Global facts
    procedural-memory.js            — Learned patterns
  identity/
    identity-manager.js             — IdentityManager facade
    core-loader.js                  — Immutable personality
    rules-engine.js                 — Behavioral guidelines
    preferences-manager.js          — Learned preferences
    bootstrap-orchestrator.js       — Onboarding state machine
    profile-inferrer.js             — LLM-based style detection
  retrieval/
    retrieval-engine.js             — Selective memory recall
    keyword-matcher.js              — Keyword extraction
    confidence-scorer.js            — Retrieval quality scoring
  consolidation/
    sleep-cycle.js                  — Scheduled consolidation
    memory-pruner.js                — Stale data cleanup
    error-analyzer.js               — Error pattern learning
    consolidator.js                 — Core consolidation logic
  utils/
    cost-tracker.js                 — LLM cost tracking
    memory-health.js                — Memory health checks
    message-batcher.js              — Message batching
    transparency.js                 — Audit/transparency helpers
```

### Runtime Data

```
~/.kenobot/memory/
  identity/                         — Identity files
    core.md                         — Core personality
    rules.json                      — Behavioral rules
    preferences.md                  — Learned preferences
    BOOTSTRAP.md                    — Bootstrap instructions (deleted when complete)
  working/                          — Working memory (per-session)
    telegram-123456789.json
  chats/                            — Episodic memory (per-chat)
    telegram-123456789/
      MEMORY.md                     — Chat long-term
      2026-02-14.md                 — Chat daily log
  MEMORY.md                         — Global long-term facts
  2026-02-14.md                     — Global daily log
  procedural/                       — Learned patterns
    patterns.json
```

---

## Integration with Agent Loop

The Cognitive System connects to the message flow through two touchpoints:

### 1. Context Building (Before LLM Call)

```
Message arrives via Nervous System
    ↓
AgentLoop._handleMessage()
    ↓
ContextBuilder.build(sessionId, message)
    ↓
CognitiveSystem.buildContext(sessionId, messageText)
    ├── Check isBootstrapping → skip memory if true
    ├── Load identity (core + rules + preferences)
    ├── Load memory (via Retrieval Engine or full load)
    └── Return { memory, workingMemory, identity, isBootstrapping }
    ↓
Provider.chat(messages, { system })
```

### 2. Memory Extraction (After LLM Response)

```
Provider returns response
    ↓
Post-processors extract tags:
    ├── <memory> → cognitive.saveMemory() → semantic (global facts)
    ├── <chat-memory> → cognitive.saveMemory() → episodic (chat events)
    ├── <working-memory> → cognitive.saveMemory() → working (scratchpad)
    └── <user> → identity.updatePreference() → preferences
    ↓
Response sent via Nervous System
```

---

## API Reference

### CognitiveSystem

```javascript
import CognitiveSystem from './cognitive/index.js'

const cognitive = new CognitiveSystem(config, memoryStore, provider, { logger })
```

#### `buildContext(sessionId, messageText) → Promise<Object>`

Build memory context for a message. Returns:
```javascript
{
  memory: { longTerm, recentNotes, chatLongTerm, chatRecent },
  workingMemory: Object | null,
  retrieval?: Object,       // when retrieval is enabled
  isBootstrapping: boolean
}
```

#### `saveMemory(sessionId, memoryTags)`

Save extracted memories from response tags.

| Tag | Memory Type | Method |
|-----|-------------|--------|
| `memory` | Semantic (global facts) | `addFact()` |
| `chatMemory` | Episodic (chat events) | `addChatFact()` |
| `workingMemory` | Working (scratchpad) | `replaceWorkingMemory()` |

#### `getMemorySystem() → MemorySystem`

Access the Memory System sub-system directly.

#### `getIdentityManager() → IdentityManager`

Access the Identity System sub-system directly.

#### `processBootstrapIfActive(sessionId, message, history) → Promise<Object|null>`

Process a message during bootstrap (if active). Returns bootstrap result or `null` if not bootstrapping.

For detailed API reference of each sub-system, see:
- [Memory System API](memory.md#api-reference)
- [Identity System API](identity.md#api-reference)

---

## Testing

Tests mirror the source structure:

```
test/cognitive/
  cognitive-system.test.js           — Facade integration tests
  memory/
    memory-system.test.js            — MemorySystem facade
    working-memory.test.js           — Working memory + staleness
    episodic-memory.test.js          — Chat events
    semantic-memory.test.js          — Global facts
    procedural-memory.test.js        — Learned patterns
  identity/
    identity-manager.test.js         — IdentityManager facade
    core-loader.test.js              — Core personality loading
    rules-engine.test.js             — Behavioral rules
    preferences-manager.test.js      — Preferences
    bootstrap-orchestrator.test.js   — Bootstrap state machine
    profile-inferrer.test.js         — LLM inference
  retrieval/
    retrieval-engine.test.js         — Selective recall
    confidence-scorer.test.js        — Scoring
  consolidation/
    consolidator.test.js             — Consolidation logic
    memory-pruner.test.js            — Pruning
    error-analyzer.test.js           — Error analysis
```

All tests use **real temp directories** for filesystem I/O (no mocking `node:fs/promises`). Logger is always mocked.

---

## Configuration

| Setting | Env Variable | Default | Description |
|---------|-------------|---------|-------------|
| Memory days | `MEMORY_DAYS` | 3 | Days of recent notes to load |
| Memory retention | `MEMORY_RETENTION_DAYS` | 30 | Days before consolidation |
| Working memory staleness | `WORKING_MEMORY_STALE_DAYS` | 7 | Days before expiry |
| Retrieval | `USE_RETRIEVAL` | true | Enable selective retrieval |
| Max facts | `RETRIEVAL_LIMIT_FACTS` | 10 | Facts per retrieval |
| Max episodes | `RETRIEVAL_LIMIT_EPISODES` | 3 | Episodes per retrieval |
| Identity path | `IDENTITY_PATH` | `~/.kenobot/memory/identity` | Identity files location |

---

## Relationship to Nervous System

The Cognitive System and Nervous System are the two bounded contexts of KenoBot:

| | Cognitive System | Nervous System |
|---|---|---|
| **Metaphor** | Brain — thinking and memory | Nervous system — signal transmission |
| **Concern** | What the bot knows, remembers, and who it is | How components communicate |
| **Location** | `src/cognitive/` | `src/nervous/` |
| **Facade** | `CognitiveSystem` | `NervousSystem` |
| **Sub-systems** | Memory, Identity, Retrieval, Consolidation | Middleware, Audit Trail |
| **Persistence** | Markdown + JSON files | JSONL audit trail |
| **API** | `cognitive.buildContext()`, `cognitive.saveMemory()` | `bus.fire()`, `bus.on()` |

They interact through the Agent Loop: the Nervous System delivers messages to the Agent Loop, which uses the Cognitive System to build context and save memories, then fires the response back through the Nervous System.

```
Nervous System           Agent Loop              Cognitive System
─────────────      ─────────────────────      ──────────────────
bus.fire()    ───→  onMessage()
                    contextBuilder.build() ───→ cognitive.buildContext()
                                          ←─── { memory, identity }
                    provider.chat()
                    post-processors       ───→ cognitive.saveMemory()
bus.fire()    ←───  emit response
```

**See also:**
- [Nervous System](../nervous-system/) — Signal-aware event bus
- [Memory System](memory.md) — Four-tier memory architecture (sub-system)
- [Identity System](identity.md) — Bot personality and preferences (sub-system)
