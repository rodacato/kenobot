# Memory Lifecycle — Complete Example

> **A step-by-step walkthrough of a memory from creation to death (and resurrection)**
>
> *Companion to [Memory System](../memory.md)*

## Table of Contents

1. [The Scenario](#the-scenario)
2. [Phase 1: Message Arrives](#phase-1-message-arrives)
3. [Phase 2: Context Building (Read Path)](#phase-2-context-building-read-path)
4. [Phase 3: LLM Response with Memory Tags](#phase-3-llm-response-with-memory-tags)
5. [Phase 4: Post-Processor Pipeline (Write Path)](#phase-4-post-processor-pipeline-write-path)
6. [Phase 5: Memory at Rest](#phase-5-memory-at-rest)
7. [Phase 6: Memory Is Read Again](#phase-6-memory-is-read-again)
8. [Phase 7: Consolidation (Sleep Cycle)](#phase-7-consolidation-sleep-cycle)
9. [Phase 8: Pruning and Decay](#phase-8-pruning-and-decay)
10. [Phase 9: Resurrection via Retrieval](#phase-9-resurrection-via-retrieval)
11. [Complete Timeline](#complete-timeline)
12. [Actors Reference](#actors-reference)

---

## The Scenario

**User:** Adrian (Telegram chat ID `123456789`)
**Date:** February 14, 2026, 14:30 UTC
**Message:** "Oye, para los webhooks de n8n usa query params para autenticación, no headers. Me costó horas descubrirlo."

This message contains a technical lesson worth remembering. Let's trace its entire lifecycle.

---

## Phase 1: Message Arrives

```
User types message in Telegram
        ↓
Grammy (Telegram SDK) receives update
        ↓
TelegramChannel.onMessage()
        ↓
bus.fire('message:in', {
  text: "Oye, para los webhooks de n8n usa query params...",
  chatId: "123456789",
  userId: "123456789",
  channel: "telegram"
})
        ↓
AgentLoop._handleMessage(message)   ← bus listener
```

**Actors involved:**
| Actor | File | Role |
|-------|------|------|
| Grammy SDK | (external) | Receives Telegram update |
| `TelegramChannel` | `src/channels/telegram.js` | Adapts Telegram → signal |
| `NervousSystem` (bus) | `src/nervous/bus.js` | Routes `message:in` signal |
| `AgentLoop` | `src/agent/loop.js` | Listens, starts processing |

**Session ID generated:** `telegram-123456789`

---

## Phase 2: Context Building (Read Path)

The AgentLoop needs to build the system prompt before calling the LLM. This is where **existing memories are loaded**.

```
AgentLoop._handleMessage()
        ↓
ContextBuilder.build("telegram-123456789", message)
        ↓
ContextBuilder._buildSystemPrompt(messageText, sessionId)
        ↓
    ┌─ IdentityManager.buildContext()
    │   ├─ CoreLoader.load()         → core.md (cached)
    │   ├─ RulesEngine.loadRules()   → rules.json (cached)
    │   ├─ PreferencesManager.load() → preferences.md (fresh read)
    │   └─ isBootstrapping?          → checks BOOTSTRAP.md existence
    │
    └─ CognitiveSystem.buildContext("telegram-123456789", messageText)
        │
        ├─ Option A (USE_RETRIEVAL=false, default):
        │   ├─ memory.getLongTermMemory()                    → MEMORY.md
        │   ├─ memory.getRecentDays(3)                       → last 3 daily logs
        │   ├─ memory.getChatLongTermMemory(sessionId)       → chats/telegram-123456789/MEMORY.md
        │   ├─ memory.getChatRecentDays(sessionId, 3)        → chats/telegram-123456789/*.md
        │   └─ memory.getWorkingMemory(sessionId)            → working/telegram-123456789.md
        │
        └─ Option B (USE_RETRIEVAL=true):
            └─ RetrievalEngine.retrieve(sessionId, messageText)
                ├─ KeywordMatcher.extractKeywords("Oye para los webhooks...")
                │   → ["webhooks", "n8n", "query", "params", "autenticación", "headers"]
                ├─ _retrieveFacts(keywords, 10)       → search MEMORY.md
                ├─ _retrieveProcedures(keywords, 5)   → search patterns.json
                └─ _retrieveEpisodes(keywords, 3)     → search daily logs
```

**Resulting system prompt structure:**

```
[Core Identity — SOUL.md]
---
[Behavioral Rules — rules.json formatted]
---
## Preferences
[preferences.md content]
---
## Memory

### Memory tags
| Tag | Use for | Scope |
|-----|---------|-------|
| `<memory>fact</memory>` | Important facts, decisions | Global, forever |
| `<chat-memory>fact</chat-memory>` | Chat-specific context | This conversation |
| `<working-memory>bullets</working-memory>` | Current task, pending | Scratchpad (replaces) |

### Long-term memory
[Contents of MEMORY.md — e.g. "Adrian prefers Spanish", "Timezone: CST"]

### Recent notes
[Contents of 2026-02-12.md, 2026-02-13.md, 2026-02-14.md]

### Chat-specific memory
[Contents of chats/telegram-123456789/MEMORY.md]

### Working memory (updated 2 hours ago)
[Contents of working/telegram-123456789.md]
```

**Actors involved:**
| Actor | File | Role |
|-------|------|------|
| `ContextBuilder` | `src/agent/context.js` | Orchestrates prompt assembly |
| `CognitiveSystem` | `src/cognitive/index.js` | Facade for memory + identity |
| `IdentityManager` | `src/cognitive/identity/identity-manager.js` | Loads personality + rules |
| `MemorySystem` | `src/cognitive/memory/memory-system.js` | Facade for 4 memory tiers |
| `SemanticMemory` | `src/cognitive/memory/semantic-memory.js` | Reads MEMORY.md + daily logs |
| `EpisodicMemory` | `src/cognitive/memory/episodic-memory.js` | Reads chat-specific logs |
| `WorkingMemory` | `src/cognitive/memory/working-memory.js` | Reads scratchpad |
| `MemoryStore` | `src/storage/memory-store.js` | All filesystem I/O |
| `RetrievalEngine` | `src/cognitive/retrieval/retrieval-engine.js` | Keyword-filtered retrieval |
| `KeywordMatcher` | `src/cognitive/retrieval/keyword-matcher.js` | Extracts & matches keywords |
| `ConfidenceScorer` | `src/cognitive/retrieval/confidence-scorer.js` | Scores retrieval quality |

---

## Phase 3: LLM Response with Memory Tags

The provider sends the system prompt + message history + current message to Claude. The LLM decides this fact is worth remembering and wraps it in tags:

```
Provider.chatWithRetry(messages, { system })
        ↓
Claude API (external)
        ↓
Response:
```

```
Buena nota! Los webhooks de n8n con query params es uno de esos trucos
que no están bien documentados.

<memory>n8n webhooks: use query params (?token=xxx) for authentication instead of headers — headers cause 401 errors</memory>

<chat-memory>Adrian spent hours debugging n8n webhook 401 — resolved with query params</chat-memory>

<working-memory>
- Current topic: n8n webhook authentication
- Status: resolved
- Key finding: query params > headers for n8n webhooks
</working-memory>
```

**The LLM generated three types of memory tags:**

| Tag | Content | Destination |
|-----|---------|-------------|
| `<memory>` | n8n webhooks: use query params... | Global `YYYY-MM-DD.md` (semantic) |
| `<chat-memory>` | Adrian spent hours debugging... | `chats/telegram-123456789/YYYY-MM-DD.md` (episodic) |
| `<working-memory>` | Bullet list of current context | `working/telegram-123456789.md` (scratchpad) |

---

## Phase 4: Post-Processor Pipeline (Write Path)

The raw response goes through a pipeline of 6 post-processors. Each one extracts its tags, persists the data, and passes clean text to the next.

```
Raw LLM response (with tags)
        ↓
runPostProcessors(text, deps)
        │
        ├─ 1. memory post-processor
        │   ├─ extractMemories(text)
        │   │   → regex: /<memory>([\s\S]*?)<\/memory>/g
        │   │   → finds: "n8n webhooks: use query params..."
        │   │   → removes tag from text
        │   ├─ apply():
        │   │   └─ memory.addFact("n8n webhooks: use query params...")
        │   │       └─ SemanticMemory.addFact()
        │   │           └─ MemoryStore.appendDaily(entry)
        │   │               └─ WRITES: ~/.kenobot/memory/2026-02-14.md
        │   │                  Appends:
        │   │                  ## 14:30 — n8n webhooks: use query params...
        │   └─ bus.fire('config:changed', { reason: 'memory update' })
        │
        ├─ 2. chat-memory post-processor
        │   ├─ extractChatMemories(text)
        │   │   → regex: /<chat-memory>([\s\S]*?)<\/chat-memory>/g
        │   │   → finds: "Adrian spent hours debugging..."
        │   ├─ apply():
        │   │   └─ memory.addChatFact(sessionId, fact)
        │   │       └─ EpisodicMemory.addChatEpisode()
        │   │           └─ MemoryStore.appendChatDaily(sessionId, entry)
        │   │               └─ WRITES: ~/.kenobot/memory/chats/telegram-123456789/2026-02-14.md
        │   │                  Appends:
        │   │                  ## 14:30 — Adrian spent hours debugging...
        │   └─ bus.fire('config:changed', { reason: 'chat memory update' })
        │
        ├─ 3. working-memory post-processor
        │   ├─ extractWorkingMemory(text)
        │   │   → regex: /<working-memory>([\s\S]*?)<\/working-memory>/g
        │   │   → finds: bullet list (last tag wins if multiple)
        │   ├─ apply():
        │   │   └─ memory.replaceWorkingMemory(sessionId, content)
        │   │       └─ WorkingMemory.replace()
        │   │           └─ MemoryStore.writeWorkingMemory(sessionId, content)
        │   │               └─ WRITES: ~/.kenobot/memory/working/telegram-123456789.md
        │   │                  Full replace (not append):
        │   │                  - Current topic: n8n webhook authentication
        │   │                  - Status: resolved
        │   │                  - Key finding: query params > headers
        │   └─ (no signal fired — scratchpad is transient)
        │
        ├─ 4. user post-processor
        │   ├─ extractUserUpdates(text) → no <user-update> tags found
        │   └─ (skip)
        │
        ├─ 5. bootstrap post-processor
        │   ├─ extractBootstrapComplete(text) → no <bootstrap-complete/> found
        │   └─ (skip)
        │
        └─ 6. metacognition post-processor
            └─ metacognition.evaluateResponse() → observe quality (no extraction)
```

**After the pipeline, clean text is returned:**

```
"Buena nota! Los webhooks de n8n con query params es uno de esos trucos
que no están bien documentados."
```

**This clean text (without tags) is:**
1. Saved to session history: `storage.saveSession(sessionId, [userMsg, assistantMsg])`
2. Sent to user: `bus.fire('message:out', { text: cleanText, chatId, channel })`

**Actors involved:**
| Actor | File | Role |
|-------|------|------|
| `runPostProcessors` | `src/agent/post-processors.js` | Orchestrates pipeline |
| `extractMemories` | `src/agent/memory-extractor.js` | Parses `<memory>` tags |
| `extractChatMemories` | `src/agent/chat-memory-extractor.js` | Parses `<chat-memory>` tags |
| `extractWorkingMemory` | `src/agent/working-memory-extractor.js` | Parses `<working-memory>` tags |
| `SemanticMemory` | `src/cognitive/memory/semantic-memory.js` | Delegates addFact |
| `EpisodicMemory` | `src/cognitive/memory/episodic-memory.js` | Delegates addChatEpisode |
| `WorkingMemory` | `src/cognitive/memory/working-memory.js` | Replaces scratchpad |
| `MemoryStore` | `src/storage/memory-store.js` | Writes to filesystem |
| `NervousSystem` (bus) | `src/nervous/bus.js` | Fires `config:changed`, `message:out` |

---

## Phase 5: Memory at Rest

After this single message, the filesystem looks like this:

```
~/.kenobot/memory/
├── MEMORY.md                                    # (unchanged — global long-term facts)
│   │ # User Profile
│   │ - Adrian prefers Spanish for personal conversation
│   │ - Timezone: America/Mexico_City
│   │
├── 2026-02-14.md                                # ← NEW ENTRY appended
│   │ ## 14:30 — n8n webhooks: use query params (?token=xxx)
│   │   for authentication instead of headers — headers cause 401 errors
│   │
├── chats/
│   └── telegram-123456789/
│       └── 2026-02-14.md                        # ← NEW ENTRY appended
│           │ ## 14:30 — Adrian spent hours debugging n8n webhook 401
│           │   — resolved with query params
│           │
├── working/
│   └── telegram-123456789.md                    # ← REPLACED entirely
│       │ - Current topic: n8n webhook authentication
│       │ - Status: resolved
│       │ - Key finding: query params > headers for n8n webhooks
│       │
└── procedural/
    └── patterns.json                            # (unchanged — no pattern yet)
```

**The memory exists in three places simultaneously:**
1. **Semantic (global)** — `2026-02-14.md`: a fact anyone can access
2. **Episodic (chat-specific)** — `chats/telegram-123456789/2026-02-14.md`: the debugging story
3. **Working (scratchpad)** — `working/telegram-123456789.md`: current task context

---

## Phase 6: Memory Is Read Again

**February 15, 2026, 10:00 UTC** — Adrian asks in a different chat or the same one:

> "Tengo un error 401 en un webhook de n8n"

```
ContextBuilder.build(sessionId, message)
        ↓
CognitiveSystem.buildContext(sessionId, "Tengo un error 401...")
        ↓
    ┌─ (Option A — full load, default):
    │   memory.getLongTermMemory()          → returns MEMORY.md (no n8n entry yet)
    │   memory.getRecentDays(3)            → returns 2026-02-13.md + 2026-02-14.md
    │                                         ↑ INCLUDES our n8n fact!
    │   memory.getChatRecentDays(sid, 3)   → returns chat episodes
    │   memory.getWorkingMemory(sid)       → returns scratchpad (still fresh, <7 days)
    │
    └─ (Option B — selective retrieval):
        RetrievalEngine.retrieve(sessionId, "Tengo un error 401 en un webhook de n8n")
            ↓
        KeywordMatcher.extractKeywords()
            → ["error", "401", "webhook", "n8n"]
            ↓
        _retrieveFacts(keywords, 10)
            → Searches MEMORY.md sections
            → Keyword match: "n8n" appears? (not yet in MEMORY.md)
            ↓
        _retrieveEpisodes(keywords, 3)
            → Searches daily logs
            → Finds: "## 14:30 — n8n webhooks: use query params..."
            → Score: "n8n" (+3) + "401" (+3) + "webhook" (+3) = 9 points
            → HIGH MATCH — included in results
            ↓
        ConfidenceScorer.score()
            → level: "high", score: 0.85
```

**Result:** The system prompt now includes the n8n memory, so Claude can say:

> "Ya pasaste por esto ayer. El truco es usar query params (?token=xxx) en lugar de headers."

**The memory was "revived" — it was read from the daily log and injected into the context.**

---

## Phase 7: Consolidation (Sleep Cycle)

**February 15, 2026, ~4:00 AM UTC** — The hourly interval check triggers.

```
setInterval check (every 1 hour)
        ↓
sleepCycle.shouldRun()
  → lastRun: null (or >20 hours ago)
  → returns true
        ↓
sleepCycle.run()
```

### Phase 7.1: Consolidation (Episodic → Semantic + Procedural)

```
Consolidator.run()
        ↓
_loadRecentEpisodes()  ← last 24 hours
  ├─ Global daily logs: reads 2026-02-14.md
  │   → Parses into entries by "## HH:MM —" headers
  │   → Entry: "## 14:30 — n8n webhooks: use query params..."
  │
  └─ Per-chat logs: reads chats/telegram-123456789/2026-02-14.md
      → Entry: "## 14:30 — Adrian spent hours debugging..."
        ↓
scoreSalience() for each entry:
  "n8n webhooks: use query params...headers cause 401 errors"
    → "error" found        → +0.4
    → "prefer" not found   → +0.0
    → "learned" not found  → +0.0
    → Score: 0.4           → BELOW threshold (0.5) — FILTERED OUT

  "Adrian spent hours debugging n8n webhook 401 — resolved with query params"
    → "error" found        → +0.4     (because "401" implies error context)
    → no other indicators  → +0.0
    → Score: 0.4           → BELOW threshold (0.5) — FILTERED OUT
```

**Wait — neither entry passes salience?** Correct. The salience filter is keyword-based and conservative. For this memory to be consolidated, the LLM would need to have written the fact with stronger indicators:

```
<memory>Learned: n8n webhooks prefer query params for auth, headers always fail with 401</memory>
```

This would score:
- "learned" → +0.4
- "prefer" → +0.6
- "fail" → +0.4
- **Total: 1.0** (capped) — **passes salience!**

**Assuming the fact passes salience, what happens next:**

```
extractFacts(salientEpisodes)
  → Scans for fact indicators: "prefers", "always", "never", "uses"...
  → Line contains "prefer" → extracted as fact:
    "n8n webhooks prefer query params for auth, headers always fail with 401"
        ↓
Deduplicate against MEMORY.md:
  existingMemory = "Adrian prefers Spanish...Timezone: America/Mexico_City..."
  → Does existing contain "n8n webhooks prefer query params"? NO → it's new
        ↓
_appendToLongTerm([fact])
  → Reads existing MEMORY.md
  → Appends:
    ## Consolidated — 2026-02-15
    - n8n webhooks prefer query params for auth, headers always fail with 401
  → Writes updated MEMORY.md
```

```
extractPatterns(salientEpisodes)
  → Entry has "error"/"fail" AND "resolved"? YES
  → errorLines: ["n8n webhook 401 error"]
  → resolutionLines: ["resolved with query params"]
        ↓
Creates pattern:
  {
    id: "pattern-1739588400000-0",
    trigger: "n8n webhook 401 error",
    response: "resolved with query params",
    confidence: 0.6,
    learnedFrom: "consolidation"
  }
        ↓
ProceduralMemory.add(pattern)
  → Appends to patterns.json
```

**MEMORY.md after consolidation:**

```markdown
# User Profile
- Adrian prefers Spanish for personal conversation
- Timezone: America/Mexico_City

## Consolidated — 2026-02-15
- n8n webhooks prefer query params for auth, headers always fail with 401
```

**The memory has been PROMOTED from episodic (daily log) to semantic (MEMORY.md) and procedural (patterns.json).**

### Phase 7.2: Error Analysis

```
ErrorAnalyzer.run()
        ↓
Parse recent episodes → detect "error", "fail", "exception"
  → Found: "401 error" in n8n entry
  → Classify: "external" (network/timeout/401 → external category)
  → External errors → NO lesson extracted (only internal/config errors get lessons)
```

### Phase 7.3: Pruning

```
MemoryPruner.run()
        ↓
pruneWorkingMemory():
  → List sessions: [telegram-123456789]
  → Age of telegram-123456789.md: 14 hours (< 7 days)
  → KEEP (not stale yet)
        ↓
prunePatterns():
  → New pattern confidence: 0.6 (> 0.3 threshold)
  → KEEP
        ↓
compressEpisodes():
  → List daily logs: [2026-02-14.md]
  → Age: 1 day (< 30 days archive threshold)
  → KEEP
        ↓
compactLongTermMemory():
  → Parse MEMORY.md bullet points
  → 3 facts, check Jaccard similarity pairwise
  → No duplicates found (all distinct)
  → KEEP all
```

### Phase 7.4: Self-Improvement

```
SelfImprover.run(previousResults)
  → Generates improvement proposals based on consolidation stats
  → (Phase 4: basic proposals, no action taken)
```

**Actors involved in sleep cycle:**
| Actor | File | Role |
|-------|------|------|
| `SleepCycle` | `src/cognitive/consolidation/sleep-cycle.js` | Orchestrates 4 phases |
| `Consolidator` | `src/cognitive/consolidation/consolidator.js` | Episodic → semantic + procedural |
| `ErrorAnalyzer` | `src/cognitive/consolidation/error-analyzer.js` | Extracts lessons from errors |
| `MemoryPruner` | `src/cognitive/consolidation/memory-pruner.js` | Deletes stale/redundant memory |
| `SelfImprover` | `src/cognitive/consolidation/self-improver.js` | Generates improvement proposals |
| `MemorySystem` | `src/cognitive/memory/memory-system.js` | Reads/writes all tiers |
| `MemoryStore` | `src/storage/memory-store.js` | Filesystem persistence |

---

## Phase 8: Pruning and Decay

Memory doesn't live forever. Here's what dies and when:

### Working Memory Death (7 days)

**February 21, 2026** — Adrian hasn't messaged in this chat for a week.

```
MemoryPruner.pruneWorkingMemory()
  → telegram-123456789.md age: 7.4 days > 7 days threshold
  → DELETE ~/.kenobot/memory/working/telegram-123456789.md
  → Log: "working_memory_pruned: telegram-123456789"
```

**The scratchpad is gone.** Next time Adrian messages, working memory will be `null` — no "Current topic" or "Status" context. The LLM starts with a clean scratchpad.

### Episodic Memory Death (30 days)

**March 16, 2026** — The daily log is older than 30 days.

```
MemoryPruner.compressEpisodes()
  → 2026-02-14.md age: 30 days ≥ 30 days threshold
  → DELETE ~/.kenobot/memory/2026-02-14.md
  → Log: "daily_log_deleted: 2026-02-14.md"
```

**The daily entry is gone.** But the fact was already promoted to MEMORY.md during consolidation, so the knowledge survives. The episodic detail ("Adrian spent hours") is lost — only the distilled fact remains.

### Procedural Pattern Decay

If the n8n pattern is never matched (usageCount stays 0) AND its confidence drops below 0.3:

```
MemoryPruner.prunePatterns()
  → pattern "n8n webhook 401 error"
  → confidence: 0.6, usageCount: 0
  → 0.6 > 0.3 → KEEP (confidence too high to prune)
```

Patterns only die if both conditions are met:
- `confidence < 0.3`
- `usageCount === 0`

Currently, confidence doesn't decay automatically — it's set at creation and only changes through explicit updates. So this pattern survives indefinitely at 0.6 confidence.

### Semantic Memory Deduplication

If a future consolidation writes a similar fact:

```
MEMORY.md contains:
  - n8n webhooks prefer query params for auth, headers always fail with 401

New consolidation tries to add:
  - n8n webhooks: use query params for authentication, not headers

compactLongTermMemory():
  Jaccard similarity:
    Set A: {n8n, webhooks, prefer, query, params, auth, headers, always, fail, 401}
    Set B: {n8n, webhooks, use, query, params, authentication, not, headers}
    Intersection: {n8n, webhooks, query, params, headers} = 5
    Union: {n8n, webhooks, prefer, query, params, auth, headers, always, fail, 401, use, authentication, not} = 13
    Similarity: 5/13 = 0.38 → BELOW 0.7 threshold → KEEP both

  (These are different enough to coexist — the dedup threshold is strict)
```

Only near-identical facts (>70% word overlap) get deduplicated.

---

## Phase 9: Resurrection via Retrieval

**June 2026** — Months later, a friend messages the bot:

> "Me da un 401 cuando hago un POST al webhook de n8n"

The daily logs are long gone (pruned after 30 days). Working memory is gone (pruned after 7 days). But:

### The fact lives in MEMORY.md (semantic memory)

```
ContextBuilder._buildMemorySection()
  → memory.getLongTermMemory()
  → Returns MEMORY.md including:
    "- n8n webhooks prefer query params for auth, headers always fail with 401"
  → This is ALWAYS included in the system prompt (full load mode)
```

### The pattern lives in patterns.json (procedural memory)

```
ProceduralMemory.match("Me da un 401 cuando hago un POST al webhook de n8n")
  → Pattern trigger: "n8n webhook 401 error"
  → Keywords: ["n8n", "webhook", "401", "error"]
  → Message keywords: ["401", "POST", "webhook", "n8n"]
  → Matches: n8n, webhook, 401 → coverage: 3/4 * 0.6 confidence = 0.45
  → MATCH found → pattern.response: "resolved with query params"
```

### With selective retrieval (USE_RETRIEVAL=true)

```
RetrievalEngine.retrieve(sessionId, "Me da un 401...")
  → Keywords: ["401", "POST", "webhook", "n8n"]
  → _retrieveFacts():
      Searches MEMORY.md sections
      → Section "Consolidated — 2026-02-15" contains "n8n", "webhooks", "401"
      → Score: 3 exact matches * 3 points = 9
      → HIGH relevance — included
  → _retrieveEpisodes():
      → Daily logs from June: no n8n mentions → nothing found
  → Confidence: HIGH (strong fact match)
```

**The memory was resurrected.** Even though the original daily log and working memory are gone, the consolidated fact in MEMORY.md and the procedural pattern survive. Claude can answer:

> "Es un clásico de n8n. Usa query params (?token=xxx) en lugar de headers para la autenticación del webhook."

---

## Complete Timeline

```
Feb 14, 14:30   MESSAGE ARRIVES
                ├─ Read existing memory (context building)
                ├─ LLM generates response with <memory>, <chat-memory>, <working-memory> tags
                ├─ Post-processors extract tags and persist:
                │   ├─ Semantic fact   → ~/.kenobot/memory/2026-02-14.md
                │   ├─ Chat episode    → ~/.kenobot/memory/chats/telegram-123456789/2026-02-14.md
                │   └─ Working memory  → ~/.kenobot/memory/working/telegram-123456789.md
                └─ Clean text sent to user

Feb 15, 04:00   SLEEP CYCLE RUNS
                ├─ Phase 1: Consolidation
                │   ├─ Episodic fact → promoted to MEMORY.md (if salience ≥ 0.5)
                │   └─ Error+resolution → new procedural pattern in patterns.json
                ├─ Phase 2: Error analysis (external error → no lesson)
                ├─ Phase 3: Pruning (everything too young to prune)
                └─ Phase 4: Self-improvement proposals

Feb 15, 10:00   MEMORY READ AGAIN
                └─ Daily log still exists → fact found → injected into context

Feb 21          WORKING MEMORY DIES (7 days stale)
                └─ Pruner deletes working/telegram-123456789.md

Mar 16          DAILY LOG DIES (30 days old)
                └─ Pruner deletes 2026-02-14.md
                └─ But fact lives on in MEMORY.md

Jun 2026        RESURRECTION VIA RETRIEVAL
                ├─ MEMORY.md still contains the fact (semantic = permanent)
                ├─ patterns.json still contains the pattern (procedural = permanent*)
                └─ Context includes the memory → bot answers correctly
```

\* Procedural patterns only die if `confidence < 0.3 AND usageCount === 0`.

---

## Actors Reference

### Write Path (Memory Creation)

| Step | Actor | File |
|------|-------|------|
| 1 | `TelegramChannel` | `src/channels/telegram.js` |
| 2 | `NervousSystem` (bus) | `src/nervous/bus.js` |
| 3 | `AgentLoop` | `src/agent/loop.js` |
| 4 | `Provider` (Claude API) | `src/providers/claude-api.js` |
| 5 | `runPostProcessors` | `src/agent/post-processors.js` |
| 6 | `extractMemories` | `src/agent/memory-extractor.js` |
| 7 | `extractChatMemories` | `src/agent/chat-memory-extractor.js` |
| 8 | `extractWorkingMemory` | `src/agent/working-memory-extractor.js` |
| 9 | `MemorySystem` | `src/cognitive/memory/memory-system.js` |
| 10 | `SemanticMemory` / `EpisodicMemory` / `WorkingMemory` | `src/cognitive/memory/*.js` |
| 11 | `MemoryStore` | `src/storage/memory-store.js` |

### Read Path (Memory Retrieval)

| Step | Actor | File |
|------|-------|------|
| 1 | `ContextBuilder` | `src/agent/context.js` |
| 2 | `CognitiveSystem` | `src/cognitive/index.js` |
| 3 | `MemorySystem` | `src/cognitive/memory/memory-system.js` |
| 4 | `RetrievalEngine` (optional) | `src/cognitive/retrieval/retrieval-engine.js` |
| 5 | `KeywordMatcher` | `src/cognitive/retrieval/keyword-matcher.js` |
| 6 | `ConfidenceScorer` | `src/cognitive/retrieval/confidence-scorer.js` |
| 7 | `MemoryStore` | `src/storage/memory-store.js` |

### Consolidation Path (Memory Promotion)

| Step | Actor | File |
|------|-------|------|
| 1 | `SleepCycle` | `src/cognitive/consolidation/sleep-cycle.js` |
| 2 | `Consolidator` | `src/cognitive/consolidation/consolidator.js` |
| 3 | `ErrorAnalyzer` | `src/cognitive/consolidation/error-analyzer.js` |
| 4 | `MemoryPruner` | `src/cognitive/consolidation/memory-pruner.js` |
| 5 | `SelfImprover` | `src/cognitive/consolidation/self-improver.js` |

### Pruning Path (Memory Death)

| Memory Type | Threshold | Actor |
|-------------|-----------|-------|
| Working Memory | 7 days stale | `MemoryPruner.pruneWorkingMemory()` |
| Daily Logs | 30 days old | `MemoryPruner.compressEpisodes()` |
| Procedural Patterns | confidence < 0.3 AND usageCount === 0 | `MemoryPruner.prunePatterns()` |
| Semantic Facts | Jaccard similarity > 0.7 (dedup only) | `MemoryPruner.compactLongTermMemory()` |
