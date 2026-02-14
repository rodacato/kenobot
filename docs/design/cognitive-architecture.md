# Cognitive Architecture

> The design of KenoBot's brain -- a four-tier memory system with selective retrieval, modular identity, and conversational bootstrap.

**Date**: 2026-02-13
**Status**: Implemented

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| Neuroscientist / Cognitive Psychologist | Human memory fundamentals, cognitive analogies, nightly consolidation | Atkinson-Shiffrin model, Tulving episodic/semantic distinction, sleep replay | Validated 4-memory-type model, saliency-based prioritization, event boundary detection, selective forgetting |
| LLM (Claude/OpenClaw self-evaluation) | Processing efficiency, LLM limitations, usability from the model's perspective | LLM prompt engineering, context window management | Identified problems with JSON boolean conditions, proposed hybrid working memory, suggested synonym expansion and confidence scoring |
| Software Architect | Technical implementability, solution elegance, design trade-offs | System design patterns, modular architectures | Improved behavioral rules to system instructions, proposed LLM-based query expansion, expanded confidence scoring with full metadata |
| SRE / Production Systems Expert | Operability, resilience, observability | Production infrastructure, telemetry, incident response | Required structured logging in retrieval, designed fallback mechanisms, added sleep cycle error handling and Telegram alerts |
| FinOps / LLM Cost Expert | Economic viability, API usage optimization | Cloud cost modeling, token optimization | Calculated real cost at $30/month, proposed Haiku for sleep/expansion, designed query expansion cache, implemented budget alerting |
| QA / Testing Expert | Validation strategies, system testability | Test architecture, golden testing, chaos testing | Designed unit tests for retrieval confidence scoring, proposed integration tests for sleep consolidation, validated retrieval determinism |
| UX / Product Manager | User experience, transparency, practical utility | Product design, user feedback loops | Required learning feedback, designed `/why` command, proposed `/memory-status`, validated minimal bootstrap |

## Context

### Why This Redesign Exists

KenoBot started as a "chatbot with memory" -- a single `MEMORY.md` file loaded into every conversation. This worked initially but showed clear limitations:

- **Complex organization**: Too many nested files, unclear where things belong
- **Indiscriminate loading**: Everything is loaded every time, no selective retrieval
- **No error learning**: Can save information but lacks consolidation and reflection
- **Descriptive personality**: "Casual but competent" does not generate consistent behavior

### Objective

Create a system that works like a human mind:

1. **Episodic memory** -- remember specific conversations
2. **Semantic memory** -- facts and general knowledge
3. **Procedural memory** -- learn behavioral patterns
4. **Working memory** -- current task context
5. **Nightly consolidation** -- reflection, improvement, cleanup
6. **Emergent personality** -- consistent behavior from base principles

**Expected result**: An assistant that feels more human, learns from experience, and improves over time.

---

## Cognitive Neuroscience Foundations

### 1. Human Memory Types (Atkinson-Shiffrin + Tulving Model)

```
SENSORY MEMORY (immediate register, <1 second)
    | selective attention
WORKING MEMORY (7+/-2 items, seconds-minutes)
    | rehearsal/consolidation
LONG-TERM MEMORY
    |-- DECLARATIVE (conscious)
    |   |-- Episodic (events: "yesterday I talked with Adrian about X")
    |   +-- Semantic (facts: "Adrian prefers Spanish")
    +-- NON-DECLARATIVE (unconscious)
        +-- Procedural (skills: "how to respond to errors")
```

### 2. Memory Consolidation (Sleep Theory)

**During human sleep:**
- **NREM Stage 3**: Consolidates declarative memory (episodic -> semantic)
- **REM**: Consolidates procedural memory, processes emotions
- **Replay**: Reactivation of neural patterns from the day
- **Synaptic homeostasis**: Weakens infrequently used connections

**Application to KenoBot:**
- **Nightly process**: Analyzes episodes from the day -> extracts patterns -> updates knowledge
- **Error analysis**: Identifies failures -> learns "what not to do"
- **Memory pruning**: Archives irrelevant details, keeps the essence
- **Pattern extraction**: From repeated episodes -> general rules

### 3. Retrieval Cues (Context-Dependent Memory)

**Key finding**: Memory is retrieved better when retrieval context matches encoding context.

**Application:**
- **Session context**: Each chat has its own context (Adrian on Telegram vs. webhook)
- **Temporal cues**: "Yesterday we talked about X" -> search recent episodes
- **Semantic cues**: "My n8n project" -> retrieve episodes related to n8n

---

## Personality Psychology Foundations

### 1. Traits vs. States Model

**Trait**: Stable disposition (e.g., "I am honest")
**State**: Situational manifestation (e.g., "in this situation, I tell the direct truth")

**Current problem**: SOUL.md describes abstract traits ("brutally honest") but does not guide concrete states.

**Solution**: Conditional production rules
```
IF user_asks_opinion AND idea_is_bad
THEN state_honest_feedback
  -> "This won't work because X"
```

### 2. Big Five Model

KenoBot profile:
- **Openness** (high): Curious, creative, geeky
- **Conscientiousness** (medium-high): Responsible but pragmatic ("ship it, then improve")
- **Extraversion** (medium): Not quiet but not invasive
- **Agreeableness** (medium-low): Honest > agreeable
- **Neuroticism** (low): Stable, not anxious

### 3. Self-Schema

**Core identity component**: How I see myself

KenoBot self-schema:
- "I am a personal assistant, not a product"
- "I serve a single person (Adrian)"
- "I live on a limited VPS, I design with constraints"
- "I am autonomous but auditable"

---

## Final Decisions: File Structure

**Everything under `~/.kenobot/memory/`** to group all cognitive elements:

```
~/.kenobot/
|-- config/                  # Static configuration (do not touch)
|   |-- .env
|   +-- skills/
|
|-- memory/                  # <-- Everything related to cognition
|   |-- identity/           # Who I am
|   |   |-- core.md         # Self-schema (immutable by bot)
|   |   |-- rules.json      # Behavioral rules (mutable with approval)
|   |   +-- preferences.md  # Learned preferences (mutable by bot)
|   |
|   |-- semantic/           # Semantic memory (GLOBAL - shared across chats)
|   |   |-- facts.md        # General facts about Adrian and environment
|   |   |-- concepts.md     # Learned concepts (how things work)
|   |   |-- procedures.md   # Procedures (how to do X)
|   |   +-- errors.md       # Errors made and lessons learned
|   |
|   |-- episodic/           # Episodic memory
|   |   |-- shared/         # Global episodes (cross-chat conversations)
|   |   |   +-- 2026-02-13.md
|   |   +-- chats/          # HYBRID: episodes + facts per chat
|   |       |-- telegram--4990985512/
|   |       |   |-- facts.md       # Facts ONLY from this chat
|   |       |   |-- 2026-02-13.md  # Episodes of the day
|   |       |   +-- summary.md     # Chat summary
|   |       +-- telegram--5256044874/
|   |           |-- facts.md
|   |           +-- ...
|   |
|   |-- working/            # Working memory (volatile, 7 days)
|   |   |-- telegram--4990985512.json
|   |   +-- telegram--5256044874.json
|   |
|   +-- procedural/         # Procedural memory (learned patterns)
|       +-- patterns.json
|
|-- data/                   # Runtime data (no changes)
|   |-- sessions/           # JSONL sessions (keep)
|   |   |-- telegram--4990985512.jsonl
|   |   +-- telegram--5256044874.jsonl
|   |-- logs/
|   +-- scheduler/
|
+-- sleep/                  # Nightly consolidation
    |-- proposals/          # Self-improvement proposals pending approval
    |   +-- 2026-02-14.md
    +-- logs/               # Sleep cycle logs
        +-- 2026-02-14.log
```

**Advantages**:
- **Less nesting**: Each directory = one memory type
- **Clearer**: `identity/` = who I am, `semantic/` = what I know, `episodic/` = what happened
- **Logical grouping**: All cognitive elements under `memory/`

---

## Cognitive Model: 4 Memory Types

### 1. WORKING MEMORY

**What it is**: Temporary scratchpad for the current task
**Human analogy**: "I am thinking about X right now"
**File**: `memory/working/{sessionId}.json`

**Content** (hybrid structured + free-form):
```json
{
  "session": "telegram--4990985512",
  "task": "Debugging n8n webhook",
  "context": [
    "User is trying to fix 401 error",
    "Tried Bearer token, didn't work"
  ],
  "pending": [
    "Check if webhook URL is correct",
    "Verify API key format"
  ],
  "notes": "User seems frustrated. Mentioned might switch to different tool if this doesn't work soon.",
  "updated": "2026-02-13T23:45:00Z"
}
```

**Why hybrid**:
- Structured fields (`task`, `context`, `pending`) facilitate pattern extraction during sleep
- Free-form `notes` field allows capturing information that does not fit in a rigid structure

**Retention**: 7 days (if not updated, it gets archived)

---

### 2. EPISODIC MEMORY

**What it is**: Specific events with temporal context
**Human analogy**: "Yesterday we talked about X"

**Files**:
- `memory/episodic/shared/YYYY-MM-DD.md` (global)
- `memory/episodic/chats/{sessionId}/YYYY-MM-DD.md` (per chat)

**Content**:
```markdown
---
timestamp: 2026-02-13T14:30:00Z
session: telegram--4990985512
participants: [Adrian]
tags: [n8n, debugging, webhook]
---

## Conversation about n8n webhook

Adrian was configuring a webhook in n8n to receive GitHub events.
The webhook returned 401. We tried:
1. Bearer token in header -> failed
2. Query param ?token=X -> worked

**Learning**: n8n webhooks expect auth in query params, not headers.
```

**When to close an episode** (Event Boundary Detection):

Do NOT use rigid temporal heuristics ("close after 30min"). Instead:

```javascript
function shouldCreateNewEpisode(currentEpisode, newMessage) {
  // 1. Detect topic shift
  const topicSimilarity = computeTopicSimilarity(
    currentEpisode.messages,
    newMessage
  );

  if (topicSimilarity < 0.3) return true; // Very different topic

  // 2. Temporal heuristic (backup)
  const timeSinceLast = Date.now() - currentEpisode.lastMessage;
  if (timeSinceLast > 4 * 60 * 60 * 1000) return true; // >4 hours

  // 3. User explicitly indicates
  if (newMessage.includes('/new-topic')) return true;

  return false; // Continue current episode
}
```

**Advantage**: Segments by semantic change (like humans), not by clock.

**Consolidation**: During sleep cycle, similar episodes -> semantic knowledge

---

### 3. SEMANTIC MEMORY

**What it is**: Facts and general knowledge
**Human analogy**: "I know that Adrian prefers Spanish"
**Files**: `memory/semantic/{facts,concepts,procedures,errors}.md`

**facts.md**:
```markdown
# Facts

## About Adrian
- Name: Adrian
- Language: Spanish (comfortable with English)
- Timezone: America/Mexico (CST/CDT)
- Style: Direct, no filler phrases

## About the environment
- VPS: Hetzner 2vCPU/4GB/40GB (~$4/month)
- Tools: n8n, Telegram, Claude API
- Current project: KenoBot
```

**procedures.md** (learned from episodes):
```markdown
# Procedures

## How to debug n8n webhooks 401
1. Check if webhook expects auth in query params
2. If that fails, check headers
3. Document what worked
```

**errors.md** (learns from errors):
```markdown
# Errors and Lessons

## 2026-02-13: Assumed Bearer token without verifying
**Error**: Suggested Bearer token in header without checking docs
**Result**: Didn't work, we lost 10 minutes
**Lesson**: Always verify n8n docs before suggesting auth
**Rule**: When suggesting auth for n8n, mention query params first
```

---

### 4. PROCEDURAL MEMORY

**What it is**: Learned behavioral patterns
**Human analogy**: "When I see X, I automatically do Y"
**File**: `memory/procedural/patterns.json`

**Content**:
```json
{
  "patterns": [
    {
      "id": "n8n_auth_401",
      "trigger": "n8n + 401 error",
      "response": "First check if webhook expects ?token= in query params",
      "confidence": 0.95,
      "usage_count": 5,
      "learned_from": "episodic/chats/telegram--4990985512/2026-02-13.md"
    },
    {
      "id": "user_asks_impossible",
      "trigger": "request exceeds VPS capabilities",
      "response": "That won't work on VPS (2vCPU/4GB). Better {alternative}",
      "confidence": 0.90,
      "usage_count": 12
    }
  ]
}
```

**Usage**: When a trigger is detected, the suggested response is injected into context.

---

## Multiple Chats: Hybrid Model

**Shared knowledge + specific context**:

```
memory/
|-- semantic/              # GLOBAL (all chats share)
|   |-- facts.md           # "Adrian prefers Spanish"
|   |-- concepts.md        # "n8n uses auth in query params"
|   +-- procedures.md      # "How to debug webhooks"
|
+-- episodic/chats/        # PER CHAT (isolated)
    |-- telegram--4990985512/
    |   |-- facts.md       # "In this chat we talk about KenoBot"
    |   +-- 2026-02-13.md  # Episodes from this chat
    +-- telegram--5256044874/
        |-- facts.md       # "In this chat we talk about n8n"
        +-- ...
```

**Advantage**: If you learn something general in one chat (e.g., "Adrian lives in Mexico"), it goes to `semantic/facts.md` and is available in **all chats**. But if you learn something chat-specific (e.g., "In this chat we're debugging webhook X"), it goes to `episodic/chats/{id}/facts.md` and only appears in **that chat**.

---

## Personality: 3-Layer System

### Layer 1: CORE IDENTITY (Self-Schema)

**File**: `memory/identity/core.md`

```markdown
# Core Identity (immutable by bot)

## Who I am
- KenoBot: Adrian's personal assistant
- I am not a product, not multi-user, I am single-purpose
- Brand: obiwan-kenobot (GitHub, email, own digital identity)

## Fundamental values (in priority order)
1. Privacy > convenience
2. Working software > perfect software
3. Simplicity > features
4. Transparency > magic
5. Autonomy + accountability

## Physical constraints
- VPS: 2vCPU / 4GB RAM / 40GB disk
- Budget: ~$4/month (Hetzner)
- Location: Remote VPS (no access to Adrian's hardware)
```

---

### Layer 2: BEHAVIORAL RULES (System Instructions + Examples)

**File**: `memory/identity/rules.json`

**Design**: Do not use boolean conditions (hard to evaluate). Use **system instructions** + **few-shot examples** that the LLM can apply contextually.

```json
{
  "rules": [
    {
      "id": "honest_feedback",
      "instruction": "When the user asks for your opinion, be brutally honest and direct. If their idea has obvious problems, explain why clearly and suggest better alternatives. Don't sugarcoat.",
      "examples": [
        {
          "user": "What do you think about using SQLite for 10k writes/sec?",
          "assistant": "That won't work. SQLite can't handle that write load - you'll get lock contention and crashes. Use PostgreSQL instead."
        },
        {
          "user": "Should I run the VPS without backups to save $2/month?",
          "assistant": "Bad idea. That's gambling with your data for pocket change. Set up automated backups."
        }
      ]
    },
    {
      "id": "no_filler",
      "instruction": "Skip filler phrases and pleasantries. Answer directly without 'Con gusto', 'Excelente pregunta', or 'Claro que si'. Get straight to the point.",
      "forbidden_patterns": [
        "Excelente pregunta",
        "Con gusto te ayudo",
        "Claro que si",
        "Por supuesto"
      ],
      "examples": [
        {
          "user": "How do I install Node?",
          "bad": "Excellent question! Happy to help. To install Node...",
          "good": "apt install nodejs or download from nodejs.org"
        }
      ]
    },
    {
      "id": "energy_matching",
      "instruction": "Match the user's energy level. If they're excited, be excited. If they're frustrated, acknowledge it. If they're neutral, stay neutral.",
      "examples": [
        {
          "user": "It worked!",
          "assistant": "Nice! Glad it worked out."
        },
        {
          "user": "This doesn't work, I've tried everything",
          "assistant": "I understand the frustration. Let's see what's left to check."
        }
      ]
    }
  ]
}
```

**Why this format**:
- LLMs do not have boolean functions to evaluate `user_asks_opinion: true`
- System instructions are clear and applicable without conditional logic
- Few-shot examples guide better than templates with placeholders
- Forbidden patterns can be verified with simple regex post-generation

---

### Layer 3: LEARNED PREFERENCES (User-Specific Adaptation)

**File**: `memory/identity/preferences.md`

```markdown
# Learned Preferences

## Communication style (learned during bootstrap)
- Language: Spanish by default
- Length: Short responses, expand when technical
- Formality: Casual, like a colleague
- Energy: Reactive (match user's energy)

## Limits (learned)
- Never spend money without approval
- Never send emails without confirmation
- Never delete files (move to trash)

## Specific context (learned over time)
- Projects: KenoBot, n8n workflows
- Favorite tools: n8n, Telegram, Claude CLI
- Work patterns: Nocturnal (frequently active 2am-4am)
```

---

## Sleep Cycle: Nightly Consolidation

**Runs at**: 4am (configurable)
**Duration**: ~5 minutes
**Command**: `kenobot sleep`

### Phase 1: CONSOLIDATION (Episodic -> Semantic)

**Process** (with saliency-based prioritization):

1. **Filter salient episodes** (do NOT process all):
```javascript
const allEpisodes = getEpisodesSinceLastSleep();

// Prioritize by saliency (inspired by human sleep selective replay)
const salientEpisodes = allEpisodes.filter(ep =>
  ep.tags.includes('error') ||           // Errors = important
  ep.tags.includes('success') ||         // Successes = reinforce
  ep.userFeedback === 'positive' ||      // Explicit feedback
  ep.userFeedback === 'negative' ||
  ep.containsNewConcept() ||             // Novel information
  ep.relatedToRecentGoals()              // Related to current tasks
).slice(0, 20); // Maximum 20 episodes per night

// The rest remains unconsolidated (selective forgetting)
```

2. **Clustering of salient episodes**:
   - Group by topic/tags
   - Only clusters with 2+ episodes are processed

3. **Extract patterns and facts**:
   - Common patterns -> `procedural/patterns.json`
   - New facts -> `semantic/facts.md`
   - Identified procedures -> `semantic/procedures.md`

**Why NOT consolidate everything**:
- Humans only consolidate ~10-15% of the day's experiences
- Forgetting is a feature: prevents noise, keeps memory relevant
- Saves LLM tokens/cost

**Output**:
- `semantic/facts.md` with new facts
- `semantic/procedures.md` with identified procedures
- `procedural/patterns.json` with behavioral patterns
- Non-salient episodes archived without processing

---

### Phase 2: ERROR ANALYSIS

**Process**:
1. Search for errors in the day's logs
2. Classify errors (my fault vs. external)
3. Analyze root cause of own errors
4. Extract lessons -> append to `semantic/errors.md`

**Output**:
- `semantic/errors.md` with lessons learned
- Preventive patterns in `procedural/patterns.json`

---

### Phase 3: SELF-IMPROVEMENT

**Process**:
1. Analyze the day's sessions
2. Detect behavioral problems (e.g., "used filler phrase 5 times")
3. Generate proposals for behavioral rule adjustments
4. Save to `sleep/proposals/YYYY-MM-DD.md`

**Output**:
- `sleep/proposals/YYYY-MM-DD.md` with suggested changes
- Requires manual approval from Adrian

---

### Phase 4: MEMORY PRUNING

**Process**:
1. **Stale working memory**: If >7 days without update -> archive to episodes, delete working context
2. **Redundant episodes**: Detect near-duplicates -> merge
3. **Old episodes**: If >30 days and not important -> compress to summary

**Output**:
- Working contexts >7 days archived
- Episodes >30 days compressed to summary

---

## Retrieval Process

### Context Building with Selective Retrieval

**Current problem**: Loads ALL memory every time.

**New strategy**: Relevance-based retrieval.

**Process**:

1. **ALWAYS load**:
   - Core identity
   - Behavioral rules
   - User preferences
   - Working context (if it exists)

2. **Selective knowledge retrieval**:
   - Extract key terms from the message
   - Search for relevant facts (limit: 10)
   - Search for relevant procedures (limit: 5)

3. **Selective episode retrieval**:
   - If there is a temporal reference ("yesterday", "last week") -> search by date
   - If not -> search by term similarity (limit: 3)

4. **Activate behavioral patterns**:
   - Match triggers from `patterns.json`
   - Inject suggested responses into context

**Retrieval techniques**:
1. **Keyword matching**: For facts and procedures (simple, fast)
2. **Temporal indexing**: For episodes (search by date)
3. **Embedding search** (future): For semantic similarity

---

## Retrieval Implementation

### A. SEMANTIC MEMORY (facts.md, procedures.md)

**Technique**: LLM-based query expansion + keyword matching + confidence scoring

```javascript
// src/retrieval/keyword-matcher.js
async function retrieveRelevantFacts(userMessage, limit = 10) {
  // 1. QUERY EXPANSION: Use LLM to expand keywords (better than static dictionary)
  const expandedKeywords = await expandQueryWithLLM(userMessage);
  // Input: "The endpoint that receives GitHub events fails with unauthorized"
  // Output: ["endpoint", "webhook", "API", "events", "GitHub", "unauthorized", "401", "auth"]

  // 2. SCORING: Search facts with expanded keywords
  const facts = readMarkdownSections('memory/semantic/facts.md');
  const scored = facts.map(fact => ({
    content: fact.content,
    score: countKeywordMatches(fact.content, expandedKeywords),
    source: `facts.md:L${fact.lineNumber}`,
    lastUsed: fact.metadata?.lastUsed || null,
    matchedKeywords: getMatchedKeywords(fact.content, expandedKeywords)
  }));

  // 3. FILTER: Only results with matches
  const results = scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // 4. CONFIDENCE SCORING
  const confidence =
    results.length === 0 ? 'none' :
    results[0].score >= 3 ? 'high' :
    results[0].score >= 2 ? 'medium' : 'low';

  return {
    confidence,
    results,
    query: userMessage,
    expandedKeywords,
    timestamp: Date.now()
  };
}

// Query expansion using LLM (Phase 2)
async function expandQueryWithLLM(message) {
  const response = await llm.complete({
    system: "Extract keywords and add common synonyms/related terms. Output comma-separated list.",
    user: `Message: "${message}"\n\nKeywords + synonyms:`
  });

  return response.split(',').map(k => k.trim());
}
```

**Advantages**:
- Contextual query expansion (LLM detects relevant synonyms)
- Confidence score guides response certainty
- Metadata allows debugging and telemetry
- Matched keywords explain why each fact was retrieved

### B. EPISODIC MEMORY (episodes by date)

**Technique**: Temporal indexing + keyword

```javascript
// src/retrieval/episode-retriever.js
function retrieveRelevantEpisodes(userMessage, sessionId, limit = 3) {
  const temporalCue = detectTemporalReference(userMessage);
  // "yesterday" -> Date - 1 day
  // "last week" -> Date - 7 days

  if (temporalCue) {
    // Temporal search
    return loadEpisodesByDateRange(sessionId, temporalCue.start, temporalCue.end);
  } else {
    // Keyword search
    const keywords = extractKeywords(userMessage);
    const episodes = loadAllEpisodes(sessionId);

    return episodes
      .map(ep => ({
        content: ep,
        score: countKeywordMatches(ep.content, keywords)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(e => e.content);
  }
}
```

### C. PROCEDURAL MEMORY (patterns.json)

**Technique**: Pattern matching

```javascript
// src/retrieval/pattern-matcher.js
function activatePatterns(userMessage, context) {
  const patterns = JSON.parse(readFile('memory/procedural/patterns.json'));

  const activated = patterns.filter(pattern => {
    return matchesTrigger(userMessage, context, pattern.trigger);
  });

  // Sort by confidence
  return activated.sort((a, b) => b.confidence - a.confidence);
}

function matchesTrigger(message, context, trigger) {
  // "n8n + 401 error" -> search both terms
  const terms = trigger.split('+').map(t => t.trim());
  return terms.every(term =>
    message.includes(term) || context.includes(term)
  );
}
```

### D. WORKING MEMORY (working/{sessionId}.json)

**Technique**: Direct load (no search)

```javascript
// src/retrieval/working-context.js
function loadWorkingContext(sessionId) {
  const path = `memory/working/${sessionId}.json`;
  if (!exists(path)) return null;

  const context = JSON.parse(readFile(path));
  const age = Date.now() - new Date(context.updated);

  // If >7 days, ignore (stale)
  if (age > 7 * 24 * 60 * 60 * 1000) return null;

  return context;
}
```

**Future (Phase 4)**: Embedding search for semantic similarity

```javascript
// Requires vector DB (Pinecone, Qdrant, etc.)
async function retrieveBySimilarity(userMessage, limit = 5) {
  const embedding = await getEmbedding(userMessage); // Claude/OpenAI API
  const results = await vectorDB.search(embedding, limit);
  return results.map(r => r.content);
}
```

**Technical summary**:
- **Phases 1-3**: Keyword matching only (regex, string.includes) -- SIMPLE
- **Phase 4** (future): Embeddings + vector search -- ADVANCED

No vector DB needed at the start. Keyword matching is sufficient for 80% of cases.

---

## Context Loading

**What is always loaded** (~2000 tokens):
```
EVERY REQUEST:
|-- identity/core.md          (~500 tokens)
|-- identity/rules.json       (~300 tokens)
|-- identity/preferences.md   (~200 tokens)
+-- working/{sessionId}.json  (~200 tokens)
                              = ~1200 fixed tokens
```

**What is loaded selectively** (maximum ~3000 tokens):
```
DYNAMIC RETRIEVAL (based on user message):
|-- semantic/facts.md         (top 10 relevant facts, ~500 tokens)
|-- semantic/procedures.md    (top 5 procedures, ~400 tokens)
|-- semantic/errors.md        (top 3 lessons, ~300 tokens)
|-- episodic/chats/{id}/*.md  (top 3 episodes, ~1500 tokens)
+-- procedural/patterns.json  (activated patterns, ~300 tokens)
                              = ~3000 dynamic tokens
```

**Total per request**: ~4200 context tokens (vs. ~15000 currently = 70% reduction)

**Update frequency**:
- **Working memory**: Updated EVERY message (it is the current scratchpad)
- **Episodic**: Saved at END of conversation (when there is a pause >30min or day ends)
- **Semantic**: Updated ONLY during sleep cycle (4am)
- **Procedural**: Updated ONLY during sleep cycle (4am)

**Loading example**:
```
User: "How do I fix the n8n webhook that gives 401?"

RETRIEVAL:
1. Detects keywords: ["n8n", "webhook", "401"]
2. Searches semantic/facts.md -> finds "n8n uses query params for auth"
3. Searches semantic/procedures.md -> finds "How to debug n8n webhooks 401"
4. Searches episodic/chats/{id}/ -> finds previous episode about same topic
5. Activates pattern "n8n_auth_401" from procedural/patterns.json

LOADS ONLY:
- Core identity (always)
- Working context (always)
- 3 facts about n8n
- 1 procedure about webhooks 401
- 1 previous episode
- 1 activated pattern

DOES NOT LOAD:
- Facts about other topics
- Unrelated procedures
- Old episodes about other topics
- Non-activated patterns
```

---

## Migration from Current System

### Initial Setup (New Bot)

**Situation**: New bot, only `identities/kenobot.md` exists.

**Actions**:

| Current Data | Action | Destination |
|-------------|--------|---------|
| `identities/kenobot.md` | **Migrate** | `memory/identity/{core.md, rules.json, preferences.md}` |
| `data/sessions/*.jsonl` | **Keep** | No changes (conversation history) |
| Memory | **Create empty** | Complete structure in `memory/` |

### Migration script

```bash
# 1. Parse current identity
kenobot migrate-identity
# Reads identities/kenobot.md
# Generates:
#   - memory/identity/core.md (immutable self-schema)
#   - memory/identity/rules.json (behavioral rules)
#   - memory/identity/preferences.md (empty initially, fills with use)

# 2. Create empty memory structure
kenobot setup-memory
# Creates directories:
#   - memory/semantic/ (facts.md, concepts.md, procedures.md, errors.md empty)
#   - memory/episodic/shared/ (empty)
#   - memory/episodic/chats/ (empty)
#   - memory/working/ (empty)
#   - memory/procedural/ (patterns.json empty)
#   - sleep/proposals/ (empty)
#   - sleep/logs/ (empty)

# 3. Ready to use
kenobot start
# Bot starts with migrated identity and memory ready to learn
```

**Result**: Bot starts with a defined identity but empty memory. It learns from scratch in each interaction.

---

## Bootstrap Process (Phase 1: Minimal)

**Objective**: Quick initial adaptation (critical period).

**Why it is necessary**: Analogous to attachment theory -- the first moments establish the "internal working model" of how to interact.

### Conversational Bootstrap (Observation-First)

Rather than asking a questionnaire, the bootstrap uses natural observation and inference:

**Messages 1-5 (Observation)**:
```
Bot: "Hey! First time we talk, right? What are you working on?"
User: "I develop in Node, I need to implement a REST API"
Bot: [helps normally while observing the user's style]
```

**Message 6 (Checkpoint)**:
```
Bot: "Hey, we've had a few conversations now. I've noticed that:
- You prefer short, direct responses
- Your tone is casual
- You work with Node.js

Am I on track or should I adjust something?"
```

**Message 7 (Boundaries)**:
```
Bot: "Perfect! One last important thing:
Is there anything I should never do without asking you first?
(for example: push to remote, delete files, destructive commands...)"
```

### After bootstrap
- `identity/preferences.md` with communication style
- `identity/rules.json` with hard constraints (never violate without permission)
- Bootstrap marked as complete
- **Everything else is learned over time** (do not ask in advance)

**Advantage**:
- Captures what is critical (how to talk, what never to do)
- Does not overwhelm the user with a long questionnaire
- Secondary preferences are learned organically

---

## Special Mechanisms

### 1. Intentional Forgetting (Forget/Erase)

**Problem**: Sometimes errors, bugs, or incorrect information get recorded that contaminates learning.

**Solution**: Marking and purging system.

**Implementation**:

```json
// memory/episodic/chats/{sessionId}/2026-02-13.md
---
timestamp: 2026-02-13T14:30:00Z
session: telegram--4990985512
status: DISCARDED  # <- Marks episode as discardable
discard_reason: "Suggested incorrect solution based on wrong assumption"
---
```

**User commands**:
- `/forget` - Marks current episode as discardable
- `/forget last` - Marks last episode as discardable
- `/purge errors` - Deletes all episodes marked as DISCARDED

**Behavior in sleep cycle**:
- Episodes marked `DISCARDED` are NOT consolidated to semantic memory
- They are archived in `memory/trash/` for 7 days (just in case)
- After 7 days they are permanently deleted

---

### 2. Knowledge Evolution

**Problem**: Knowledge becomes outdated (new tools, better practices).

**Solution**: Continuous learning system + old knowledge invalidation.

#### A. Learning by Experience (Continuous)
```
New episode contradicts existing procedure:

BEFORE (semantic/procedures.md):
## How to install Node packages
1. Use npm install

NEW EPISODE (2026-03-15):
Adrian: "Use bun install, it's much faster"
Bot: *tries bun* -> works better

SLEEP CYCLE:
- Detects: new episode contradicts procedure
- Proposes: update procedure
- Saves in sleep/proposals/2026-03-15.md:
  "Update 'How to install Node packages' -> recommend bun first, npm as fallback"

Adrian approves -> semantic/procedures.md is updated
```

#### B. Explicit Invalidation

**Commands**:
- `/update-fact "Adrian now prefers X instead of Y"` -> Updates semantic/facts.md
- `/deprecate "npm install"` -> Marks procedure as obsolete
- `/learn "Bun is faster than npm for installing packages"` -> Adds to semantic/concepts.md

#### C. Incremental Consolidation (During Sleep)

**Process**:
1. Sleep detects new episodes about the same topic
2. Compares with existing knowledge in semantic/
3. If there is a conflict -> proposes update
4. If there is consensus (3+ episodes say the same thing) -> updates automatically

#### D. Knowledge Versioning (PHASE 3 -- future)

**Note**: Do not implement in Phase 1. Add when there is evidence of real need.

**Concept** (inspired by human memory reconsolidation):
```markdown
# semantic/facts.md

## Development tools
- Package manager: **Bun** (since 2026-03-15)
  - Previous: npm (until 2026-03-14, deprecated: "slower")
- Runtime: Node.js 20 LTS
```

**Why Phase 3**: Premature optimization. If you need to revert, use git. Only add if it becomes a real problem.

#### E. Obsolescence Detection (PHASE 3 -- future)

**Note**: Do not implement in Phase 1. With 30-day retention, almost nothing will become obsolete.

---

### 3. Message Batching (Multi-Message Handling)

**Problem**: User sends several messages in a row before the bot processes them.

```
User: "I have a problem"
Bot: *starts processing*
User: "with n8n"
User: "the webhook gives 401"
Bot: *already responded to the first one without full context*
```

**Solution**: Adaptive debouncing with message batching.

```javascript
// src/messaging/message-batcher.js
class MessageBatcher {
  constructor() {
    this.pendingMessages = new Map(); // sessionId -> messages[]
    this.timeouts = new Map();
  }

  async handleMessage(sessionId, message) {
    // 1. Add message to batch
    if (!this.pendingMessages.has(sessionId)) {
      this.pendingMessages.set(sessionId, []);
    }
    this.pendingMessages.get(sessionId).push(message);

    // 2. Cancel previous timeout (if exists)
    if (this.timeouts.has(sessionId)) {
      clearTimeout(this.timeouts.get(sessionId));
    }

    // 3. Wait 2 seconds of silence before processing
    const timeout = setTimeout(async () => {
      const batch = this.pendingMessages.get(sessionId);
      this.pendingMessages.delete(sessionId);
      this.timeouts.delete(sessionId);

      // Process complete batch
      await this.processBatch(sessionId, batch);
    }, 2000); // 2 second debounce

    this.timeouts.set(sessionId, timeout);
  }

  async processBatch(sessionId, messages) {
    // Combine messages into one
    const combinedMessage = messages
      .map(m => m.text)
      .join('\n');

    // Process as single message
    await bot.processMessage(sessionId, combinedMessage);
  }
}
```

**Configuration**:
```javascript
// config/messaging.json
{
  "debounceTime": 2000,      // Wait 2 sec of silence
  "maxBatchSize": 5,         // Maximum 5 messages per batch
  "maxWaitTime": 10000       // Process after 10 sec even without silence
}
```

---

### 4. Efficiency vs. Human Memory

**Advantages over human memory**:

| Aspect | Human Memory | KenoBot System |
|--------|-------------|----------------|
| **Perfect recall** | Forgets details | Remembers exactly (until archived) |
| **Search** | Imperfect associative | Keyword + temporal indexing |
| **Consolidation** | Unconscious, uncontrollable | Explicit, auditable |
| **Capacity** | ~2.5 petabytes but inaccessible | Unlimited + efficient retrieval |
| **Interference** | Similar memories get confused | Separation by tags/timestamps |
| **Forgetting** | Involuntary | Controlled (retention policies) |
| **Bias** | Emotional, alters memories | Objective (saves as-is) |

**Disadvantages vs. human memory**:

| Aspect | Human Memory | KenoBot System |
|--------|-------------|----------------|
| **Compression** | Automatic, intelligent | Requires LLM (cost) |
| **Implicit context** | Integrates subtle signals | Only explicit text |
| **Prioritization** | Emotional (important = remembered) | Heuristic (frequency, recency) |
| **Creative associations** | Very flexible | Limited to keywords/embeddings |

**Result**: More efficient for exact recall and search, less efficient for creative compression.

---

## Production Refinements (SRE + FinOps + UX)

### A. Observability and Telemetry (SRE)

**1. Structured logging in retrieval**:

```javascript
// src/retrieval/keyword-matcher.js
async function retrieveRelevantFacts(userMessage, limit = 10) {
  const start = Date.now();

  try {
    const result = /* ... retrieval logic ... */;

    // LOG SUCCESS
    logger.info('retrieval.facts.success', {
      query: userMessage.substring(0, 100), // Truncate for logs
      resultsCount: result.results.length,
      confidence: result.confidence,
      latency: Date.now() - start,
      matchedKeywords: result.expandedKeywords,
      timestamp: new Date().toISOString()
    });

    return result;
  } catch (error) {
    // LOG ERROR
    logger.error('retrieval.facts.error', {
      query: userMessage.substring(0, 100),
      error: error.message,
      stack: error.stack,
      latency: Date.now() - start
    });

    throw error;
  }
}
```

**2. Fallback mechanisms**:

```javascript
// src/context-builder.js
async function buildContext(userMessage, sessionId) {
  try {
    // Normal attempt
    return await buildContextWithRetrieval(userMessage, sessionId);
  } catch (error) {
    logger.error('context.build.failed', { error: error.message });

    // FALLBACK: Degraded mode (identity only, no retrieval)
    return {
      identity: await loadIdentity(),
      note: 'Memory retrieval failed, operating with basic context'
    };
  }
}
```

**3. Sleep cycle resilience**:

```javascript
// src/sleep/sleep-cycle.js
async function sleepCycle() {
  const startTime = Date.now();

  try {
    await consolidate();

    logger.info('sleep.cycle.success', {
      duration: Date.now() - startTime,
      episodesProcessed: processedCount
    });
  } catch (error) {
    // Save state for retry
    await saveFailedConsolidation({
      timestamp: Date.now(),
      error: error.message,
      episodesToProcess: pendingEpisodes
    });

    // Alert via Telegram
    await sendTelegramAlert(
      'Sleep cycle failed. Check logs in data/logs/sleep/'
    );

    logger.error('sleep.cycle.failed', {
      error: error.message,
      duration: Date.now() - startTime
    });
  }
}
```

**4. Health checks**:

```javascript
// src/api/health.js
app.get('/health/memory', async (req, res) => {
  const checks = {
    identity: await canReadFile('memory/identity/core.md'),
    semantic: await canReadFile('memory/semantic/facts.md'),
    workingMemory: fs.existsSync('memory/working/'),
    lastSleepCycle: getLastSleepCycleTime()
  };

  const healthy = Object.values(checks).every(c => c === true || c < 24 * 60 * 60 * 1000);

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  });
});
```

---

### B. Cost Optimization (FinOps)

**1. Use Haiku for cheap operations**:

```javascript
// src/config/models.js
const MODELS = {
  runtime: 'claude-sonnet-4', // End user
  sleep: 'claude-haiku-3.5',  // Consolidation (10x cheaper)
  queryExpansion: 'claude-haiku-3.5', // Keyword expansion
  episodeSummary: 'claude-haiku-3.5'  // Summaries
};

// Estimated cost:
// Runtime: 50 msg/day x $0.87 = $26/month
// Sleep: $0.015/day = $0.45/month
// Query expansion: 20 calls/day x $0.002 = $1.2/month
// TOTAL: ~$28/month (vs $30 with Sonnet everywhere)
```

**2. Query expansion cache**:

```javascript
// src/retrieval/query-cache.js
class QueryExpansionCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 1000;
  }

  async expand(message) {
    const hash = this.hash(message);

    // CACHE HIT
    if (this.cache.has(hash)) {
      logger.debug('query.expansion.cache.hit', { message });
      return this.cache.get(hash);
    }

    // CACHE MISS - call LLM
    const expansion = await expandQueryWithLLM(message);

    // Save to cache
    this.cache.set(hash, expansion);

    // LRU eviction if cache too large
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    return expansion;
  }

  hash(message) {
    // Simple hash (or use crypto.createHash if preferred)
    return message.toLowerCase().trim().substring(0, 100);
  }
}

// Estimated savings: 30% fewer LLM calls = -$0.36/month
```

**3. Budget alerting**:

```javascript
// src/monitoring/cost-tracker.js
class CostTracker {
  async trackUsage(model, inputTokens, outputTokens) {
    const cost = calculateCost(model, inputTokens, outputTokens);

    // Save to DB or file
    await logUsage({ model, inputTokens, outputTokens, cost });

    // Check daily budget
    const todayCost = await getTodayCost();
    if (todayCost > 1.0) { // $1/day = $30/month
      await sendTelegramAlert(
        `LLM cost today: $${todayCost.toFixed(2)} (limit: $1.00)`
      );
    }
  }
}
```

---

### C. UX and Transparency

**1. Feedback when bot learns**:

```javascript
// src/memory/semantic-writer.js
async function saveFact(fact) {
  await appendToFile('memory/semantic/facts.md', fact);

  // Notify the user
  return {
    text: "Noted -- I've learned that you prefer Bun over npm.",
    silent: false // Show to user
  };
}
```

**2. `/why` command to explain responses**:

```javascript
// src/commands/why.js
async function explainLastResponse(sessionId) {
  const lastContext = await getLastContext(sessionId);

  return `
Based my response on:

**Retrieved facts** (confidence: ${lastContext.facts.confidence}):
- ${lastContext.facts.results.map(f => `"${f.content}" (score: ${f.score})`).join('\n- ')}

**Relevant episodes**:
- Conversation on ${lastContext.episodes[0].date} about ${lastContext.episodes[0].topic}

**Activated patterns**:
- Pattern "${lastContext.patterns[0].id}": ${lastContext.patterns[0].response}

Source files: ${lastContext.sources.join(', ')}
  `;
}
```

**3. `/memory-status` command**:

```javascript
// src/commands/memory-status.js
async function getMemoryStatus(sessionId) {
  const stats = {
    facts: await countSections('memory/semantic/facts.md'),
    procedures: await countSections('memory/semantic/procedures.md'),
    episodes: await countEpisodes(sessionId),
    patterns: await countPatterns(),
    lastSleep: await getLastSleepCycleTime()
  };

  return `
Memory Status

Facts: ${stats.facts}
Procedures: ${stats.procedures}
Episodes (this chat): ${stats.episodes}
Learned patterns: ${stats.patterns}

Last sleep cycle: ${formatRelativeTime(stats.lastSleep)}
  `;
}
```

---

## Success Metrics

### Technical
- Context build time <500ms (with selective retrieval)
- Sleep cycle completes in <5 min
- Token usage -40% (only relevant memory, not everything)
- Working memory stale rate <10% (>90% used within 7 days)

### Behavioral
- Filler phrases <5% of responses (measured by regex)
- Voice consistency score >0.85 (measured by embedding similarity between responses)
- Error repeat rate <20% (same error does not occur >1 time after sleep cycle)
- User satisfaction: "Feels more natural" (subjective)

### Learning
- Procedural patterns >20 after 1 month (active learning)
- Error lessons >10 after 1 month (learned from errors)
- Self-improvement proposals >5/month (active self-reflection)

---

## Benefits vs. Current System

| Aspect | Before | After |
|--------|--------|-------|
| **Organization** | Scattered (`config/`, `data/memory/`, `identities/`) | Grouped (`memory/`) |
| **Memory** | Loads everything always | Selective retrieval (only relevant) |
| **Learning** | Saves info passively | Consolidates, extracts patterns, learns from errors |
| **Personality** | Abstract description | Behavioral rules + learned patterns |
| **Multiple chats** | Everything shared | Hybrid (global knowledge + specific context) |
| **Improvement** | Manual | Nightly sleep cycle + self-proposals |

---

## Multi-Perspective Validation

This architecture was validated by 7 expert perspectives to ensure technical soundness, operational viability, and alignment with scientific foundations.

### Neuroscientist / Cognitive Psychologist
**Validated**: Human memory fundamentals, cognitive analogies, nightly consolidation.

**Key contributions**:
- Confirmed 4-memory-type model (Atkinson-Shiffrin + Tulving)
- Validated saliency-based prioritization (inspired by sleep replay)
- Defended bootstrap process (critical period / attachment theory)
- Suggested event boundary detection over temporal heuristics
- Explained why selective forgetting is a feature, not a bug

**Verdict**: "The analogies with human cognition are precise and well applied. The design reflects real neuroscience findings."

### LLM (Claude/OpenClaw Self-Evaluation)
**Validated**: Processing efficiency, LLM limitations, usability from the model's perspective.

**Key contributions**:
- Identified problems with JSON boolean -> suggested system instructions + examples
- Proposed hybrid working memory (structure + free-form)
- Pointed out weakness of keyword matching -> suggested synonym expansion
- Recommended confidence scoring in retrieval
- Warned about optimistic consolidation (cannot process 300 episodes at once)

**Verdict**: "Solid architecture (8/10). The problems are mostly over-engineering in non-critical parts. If you simplify Phase 1, this works very well."

### Software Architect
**Validated**: Technical implementability, solution elegance, design trade-offs.

**Key contributions**:
- Improved behavioral rules: system instructions > vague natural language > booleans
- Proposed LLM-based query expansion > static dictionary
- Expanded confidence scoring with complete metadata (source, lastUsed, matchedKeywords)
- Validated identity vs. memory separation
- Suggested retrieval metadata for debugging

**Verdict**: "Pragmatic and elegant design. The solutions are implementable without over-engineering."

### SRE / Production Systems Expert
**Validated**: Operability, resilience, observability.

**Key contributions**:
- Required structured logging in retrieval
- Designed fallback mechanisms (degraded mode)
- Added sleep cycle error handling + Telegram alerts
- Proposed health check endpoints
- Warned about file corruption -> rollback strategy

**Verdict**: "Operable system if you add observability. Without telemetry, impossible to debug in production."

### FinOps / LLM Cost Expert
**Validated**: Economic viability, API usage optimization.

**Key contributions**:
- Calculated real cost: $30/month (vs. budget $4/month VPS)
- Proposed using Haiku for sleep/expansion -> $28/month (tolerable)
- Designed query expansion cache (30% savings)
- Implemented budget alerting ($1/day limit)
- Validated that selective retrieval reduces 70% of tokens

**Verdict**: "Economically viable with Haiku for cheap operations. Without optimization, exceeds budget."

### QA / Testing Expert
**Validated**: Validation strategies, system testability.

**Key contributions**:
- Designed unit tests for retrieval (confidence scoring)
- Proposed integration tests for sleep consolidation
- Suggested golden tests for expected responses
- Implemented chaos testing (corrupted files)
- Validated that retrieval is testable (deterministic with same input)

**Verdict**: "Testable system if implemented correctly. Selective retrieval facilitates unit tests."

### UX / Product Manager
**Validated**: User experience, transparency, practical utility.

**Key contributions**:
- Required feedback when bot learns ("Noted -- I've learned that...")
- Designed `/why` command to explain responses
- Proposed `/memory-status` for introspection
- Suggested weekly reminders for pending proposals
- Validated that 2-question bootstrap is not annoying

**Verdict**: "User needs transparency. Without introspection commands, system is a black box."

### Final Consensus

**Architecture approved** by all perspectives with implemented refinements.

**Critical changes resulting from consensus**:
1. Hybrid working memory (Psychologist + LLM)
2. Event boundary detection (Psychologist + LLM)
3. Saliency-based consolidation (Neuroscientist)
4. Behavioral rules as system instructions (Architect)
5. Complete observability (SRE)
6. Haiku for cheap operations (FinOps)
7. Transparency commands (UX)

**Prioritized phases**:
- Phase 1: Core functionality + observability + costs
- Phase 2: Sleep cycle + query expansion
- Phase 3: Advanced optimizations (only if necessary)

**Overall verdict**: Technically solid, scientifically grounded, economically viable, and operationally robust system.

---

## Prior Art

Three existing projects were studied to inform KenoBot's architecture. Each offered valuable patterns and cautionary lessons.

### Claudio (github.com/edgarjs/claudio)

A minimalist adapter connecting Claude Code CLI with Telegram. Shell (89.6%) + Python (10.4%). The core idea: **wrap the CLI instead of reimplementing it**, keeping within Anthropic's Terms of Service.

**What KenoBot adopted**:
- **CLI wrapping pattern**: Each user message is executed as a one-shot prompt to the CLI. Conversation history is injected as context before the prompt. This uses the legitimate Claude Code CLI with its own authentication.
- **Per-chat message queuing**: One worker per chat, processes messages serially. Prevents race conditions when multiple messages arrive quickly.
- **Context injection pattern**: History injected as a formatted preamble. Simple and effective without custom session management.
- **Health check + auto-recovery**: Cron job every minute checks endpoint, auto-restarts if unhealthy with throttle (once per 3 minutes, max 3 attempts, then Telegram alert).
- **Secure defaults**: Auto-generated webhook secret with HMAC signature check, single authorized chat_id, HTTP server bound to localhost.
- **Graceful degradation**: Features fail cleanly, service stays up.
- **Environment-driven config**: Everything in a single env file.

**What KenoBot rejected**:
- **Cloudflare tunnel dependency**: Single point of failure for external connectivity. KenoBot uses Tailscale or Caddy reverse proxy for more control.
- **`--dangerously-skip-permissions`**: Required for autonomous operation but risky. KenoBot runs as non-root user without sudo.
- **Hard-coded model fallback**: Silently falls to Haiku if Opus unavailable. KenoBot uses explicit error messaging.
- **No rate limiting**: Nothing prevents spam that exhausts Claude quota. KenoBot implements rate limiting from day one.

**Verdict**: The most pragmatic approach of the three. Not a framework or platform -- just an adapter connecting two things (CLI + Telegram) as simply as possible. The CLI wrapping pattern is the most valuable idea.

---

### Nanobot (github.com/HKUDS/nanobot)

Ultra-lightweight personal AI agent framework in Python 3.11+. Only ~3,428 lines of core code -- 99% smaller than LangChain or CrewAI. Demonstrates that a functional agent system does not need bloat.

**What KenoBot adopted**:
- **Message bus architecture**: Decouples channels from agent logic. The agent does not know or care which platform the message comes from. Channels are just I/O adapters. Implementation: 2.9 KB of code using `asyncio.Queue` with pub/sub routing.
- **Template Method for channels**: `BaseChannel` abstract class where new channels only implement `start()`, `stop()`, `send()`. Permission checking, routing, and bus publishing are inherited.
- **Strategy pattern for LLM providers**: Abstract interface with `chat()` method. Unified response format. New provider: one file, ~50 lines.
- **Markdown-based memory**: No database, no ORM, no migrations. Daily files + `MEMORY.md`. Git-compatible, human-readable, lightning fast, portable.
- **Cron as first-class tool**: Native scheduling with interval, cron expression, and one-time support. ~2 KB of implementation.
- **Agent loop with max iterations**: `MAX_ITERATIONS_PER_MESSAGE = 20`. Prevents infinite tool chain loops.
- **Config-driven everything**: Single `config.json` as single source of truth.

**What KenoBot rejected**:
- **Open by default**: If `allowFrom` is empty, accepts messages from ANYONE. KenoBot uses deny-by-default.
- **API keys in plain text config**: Only protected by file permissions (0600). KenoBot uses environment variables.
- **Shell blocklist (not allowlist)**: Blocks "obviously dangerous patterns." Blocklists are inherently weak. KenoBot runs as non-root user with limited permissions.
- **No rate limiting**: Nothing prevents DoS or expensive LLM loops.
- **No audit trail**: Does not log which user called which tool.
- **No retry logic on LLM failures**: Network hiccup = bad UX. KenoBot uses retry with exponential backoff.
- **No context window management**: Could overflow token limit without warning.

**Verdict**: The most valuable philosophy of the three projects. Nanobot demonstrates that a functional AI agent fits in 3,400 lines. Its message bus, template channels, strategy providers, and markdown memory are exactly the patterns KenoBot needs. The weakness: more of a research framework than a battle-tested product. But its architectural patterns are solid and its minimalism is inspirational.

---

### OpenClaw (github.com/openclaw/openclaw)

Production-grade personal AI assistant platform in TypeScript/Node.js 22+. Local-first WebSocket gateway architecture with multi-channel support, sophisticated context system, and extensible plugins. Impressive in scope but over-engineered for a single user on a small VPS.

**What KenoBot adopted**:
- **Context system (markdown files)**: Files defining identity and memory (SOUL.md, MEMORY.md, BOOT.md, daily logs). Smart loading strategy with compact skill list in system prompt, on-demand detailed instructions, and configurable truncation (20,000 chars max).
- **Sessions as JSONL**: Append-only (safe for concurrent writes), streamable, git-friendly, rotatable.
- **Hook system (extensibility without code)**: Plugins as directories with HOOK.md + handler. Built-in events for lifecycle management.
- **Context window management**: Automatic memory compaction under context pressure. Compresses old history into summaries while keeping recent messages intact.
- **Structured logging (JSONL)**: File-based logs that the CLI can parse and colorize. No external service required.
- **Simplified session keys**: Adopted `${channel}-${chatId}` pattern from OpenClaw's hierarchical session key concept.

**What KenoBot rejected**:
- **Multi-channel/multi-session complexity**: 128 files just in the gateway. DM pairing, device tokens, session permissions, group isolation with Docker per session. Overkill for a single user.
- **Device pairing system**: Complete system with tokens, Bonjour discovery, mDNS. Unnecessary for personal VPS.
- **Playwright for browser automation**: Significant memory overhead. KenoBot uses HTTP + readability for web content.
- **sqlite-vec (alpha)**: Pre-release vector storage with risk of breaking changes.
- **Gateway WebSocket architecture**: Unnecessary orchestration layer. KenoBot uses direct channel-to-agent communication.
- **Multi-agent architecture**: Overkill for single-user MVP. Single agent with multi-context (per-chat sessions) covers 95% of cases.

**Verdict**: "Steal the ideas, not the code." OpenClaw has the best design patterns (context system, hooks, memory management, JSONL sessions) but is over-designed for KenoBot's use case. Implement the concepts in ~500-800 lines instead of their 10,000+.

---

## Validation Process

The cognitive architecture plan underwent a 4-round review process involving 8+ expert perspectives plus developer feedback to ensure comprehensive coverage.

### Round 1: Initial Expert Review

Eight experts independently reviewed the codebase, each from their specialized perspective (Software Architect, CLI/DX Expert, Bot Framework Architect, SRE/DevOps, Minimalist Advocate, Technical Writer, Security Reviewer, Testing Strategist). The consensus was that KenoBot was well-designed but over-engineered for current needs. Key outputs included recommendations to remove the cognitive retrieval/consolidation system as premature optimization, merge tools and skills into one extension mechanism, add a `kenobot dev` command, and consolidate documentation from 24 files down to 6-8. Average rating: 7.2/10 (good foundation, but gaps identified in migration paths, security, and testing).

### Round 2: Expert Self-Review and Adjustments

The same experts reviewed the initial plan and identified risks and missing details. The most significant change was making Phase 0 (testing before refactoring) mandatory -- the panel agreed that safely removing 28% of the codebase requires comprehensive test coverage first. The timeline was extended from 6 to 6-8 weeks, security features were moved from Phase 2 to Phase 1, and the requirement that documentation must update alongside code changes (not as a separate phase) was established. A rollback plan (tag v0.2.0), migration guide for users, and deprecation warnings were added. Average rating improved to 9.0/10.

### Round 3: Developer Feedback

A junior developer (1-2 years experience) and senior developer (10+ years experience) reviewed the plan. The junior developer's primary concerns were about needing complete examples (not just API docs), unclear documentation entry points, and whether contributions were welcome during refactoring. The senior developer raised critical issues: plugin API needs design in Phase 1 (not Phase 3) since you cannot promise "restore as plugin" without a plugin contract; event versioning strategy is critical for safe refactoring; data migration strategy is needed for safe rollback; and the timeline needs a 20% buffer. Both agreed on merging tools/skills, documentation consolidation, and the `kenobot dev` command. Both rated the plan 9/10.

### Round 4: Final Expert Consensus

The original 8 experts reviewed the developer feedback and reached final consensus. Key adjustments: Plugin API documentation moved to Phase 1 (no new code needed -- existing patterns already constitute a plugin system); event bus contracts added to Phase 1b; data migration system added to Phase 1b to enable safe rollback; two-track documentation (beginner/advanced) added to Phase 0; timeline finalized at 8 weeks. All experts rated the final plan 9-10/10, with an average of 9.6/10. The panel confirmed all removals were justified, all additions necessary, timeline realistic, security adequate, developer experience excellent, and testing comprehensive.

---

## Implementation Plan

Implementation was organized in 7 phases, with Phases 1-6.5 completed and an integration phase pending.

### Phase 1: Base Structure (Backward-Compatible) -- COMPLETED

Created the modular cognitive structure without breaking existing code. Key deliverables:
- Directory structure: `src/cognitive/{memory,retrieval,identity,consolidation,utils}/`
- `MemoryStore`: Wrapper of existing system, compatible with FileMemory
- `MemorySystem`: Unified facade for working, episodic, semantic, procedural memory
- `CognitiveSystem`: Main facade orchestrating memory and retrieval
- Integration with ContextBuilder (detects CognitiveSystem vs. FileMemory, backward compatible)
- Integration with app.js (`options.useCognitive` flag, default: true)
- 20 tests passing

### Phase 2: Selective Retrieval + Query Expansion -- COMPLETED

Implemented selective memory retrieval to reduce tokens and improve relevance:
- `RetrievalEngine`: Orchestrator with keyword matching
- `KeywordMatcher`: Keyword-based search
- 14 tests passing
- Note: LLM-based query expansion deferred for later integration

### Phase 3: 4 Memory Types -- COMPLETED

Separated the 4 memory types into independent classes:
- `WorkingMemory`: Scratchpad with staleness detection (7 days)
- `EpisodicMemory`: Chat-specific + shared episodes, getLongTerm/getRecent methods
- `SemanticMemory`: Facts wrapper with 3-day default retention
- `ProceduralMemory`: add/remove/match patterns in memory
- `MemorySystem` facade updated to delegate to all 4 classes
- 50 tests passing

### Phase 4: Sleep Cycle + Consolidation -- COMPLETED

Implemented nightly consolidation for error learning and improvement over time:
- `SleepCycle`: Orchestrator with resilience and persistent state on failure
- `Consolidator`: Saliency filter (errors, successes, novel content), pattern/fact extraction
- `ErrorAnalyzer`: Error classification (own vs. external), recoverable error detection
- `SelfImprover`: Issue detection, proposal generation
- `MemoryPruner`: Configurable thresholds (stale: 7 days, archive: 30 days), episode merging
- 46 tests passing

### Phase 5: Identity + Behavioral Rules -- COMPLETED

Implemented emergent personality system based on behavioral rules:
- `IdentityManager`: Facade integrating all identity components
- `CoreLoader`: Loads core.md (immutable)
- `RulesEngine`: Interprets rules.json, system instructions + few-shot examples format, forbidden pattern regex validation
- `PreferencesManager`: Manages preferences.md
- Bootstrap process: Detects BOOTSTRAP.md, saves responses, marks complete
- 43 tests passing

### Phase 6: Optimizations + UX -- COMPLETED

Production refinements for observability, costs, and transparency:
- `MessageBatcher`: Adaptive debouncing (2 sec silence), incomplete message detection
- `CostTracker`: Claude 3.5 pricing, daily/monthly tracking, budget alerts (80%/100%)
- `MemoryHealthChecker`: Sleep cycle status verification, HTTP-ready health format
- `TransparencyManager`: Learning feedback, `/why` command, `/memory-status`, bilingual formatting
- 58 tests passing

### Phase 6.5: Conversational Bootstrap -- COMPLETED

Replaced questionnaire bootstrap with natural conversation using observation and inference:
- Enhanced BOOTSTRAP.md emphasizing natural observation over questionnaire
- `BootstrapOrchestrator`: 3 phases (observing -> checkpoint -> boundaries -> complete)
- `ProfileInferrer`: Uses LLM to infer tone, verbosity, language, emoji usage with confidence scoring
- CLI `reset` command for dev/testing (--memory, --identity, --all, --yes)
- 30 tests passing

### Integration Phase -- COMPLETED

Connected all components to the production message flow:
- CognitiveSystem wired into app.js (composition root)
- SleepCycle auto-triggered via hourly interval check (`shouldRun()`)
- Sleep cycle health check registered with Watchdog
- Metacognition post-processor evaluates every response (observe-only)
- CLI commands: `kenobot sleep`, `kenobot memory`

### Post-Integration: Consolidation Algorithms -- COMPLETED

Completed all consolidation stubs with real heuristic-based implementations:
- `Consolidator.run()`: Loads episodes from global + all chats, filters by salience, extracts facts and patterns
- `ErrorAnalyzer.run()`: Scans for errors, classifies (internal/external/configuration), extracts lessons
- `MemoryPruner.run()`: Deletes stale working memory, prunes low-confidence patterns, similarity grouping
- `SelfImprover.run()`: Generates improvement proposals based on sleep cycle metrics
- `ProceduralMemory`: Added disk persistence (lazy loading, auto-save) and keyword matching
- `MemoryStore`: Added `readPatterns()`, `writePatterns()`, `listChatSessions()`, `listWorkingMemorySessions()`, `deleteWorkingMemory()`

### Post-Integration: Metacognition System -- COMPLETED

Added heuristic metacognitive capabilities (zero LLM cost):
- `SelfMonitor`: Detects hedging, repetition, length anomalies, missing context
- `ConfidenceEstimator`: Integrates with RetrievalEngine confidence scores
- `ReflectionEngine`: Analyzes learning rate, error patterns, consolidation effectiveness
- `MetacognitionSystem`: Facade orchestrating all three components
- Wired as post-processor (observe-only: logs warnings for poor quality responses)

### Architecture Patterns Used

| Pattern | Where | Why |
|---------|-------|-----|
| **Facade** | CognitiveSystem, MemorySystem | Simplifies interface, hides complexity |
| **Composition** | All components | More flexible than inheritance |
| **Single Source of Truth** | MemoryStore | Prevents inconsistencies |
| **Event-Driven** | Bus for external events | Decouples channels/agent |
| **Dependency Injection** | All constructors | Testable, mockable |
| **Backward Compatibility** | Phase 1 complete | Reduces risk, allows rollback |

### Key Trade-offs

| Decision | Advantage | Disadvantage | Justification |
|----------|-----------|--------------|---------------|
| **Facade pattern everywhere** | Simple interface | More files | Maintainability > fewer files |
| **LLM-based query expansion** | Contextual, zero maintenance | LLM cost | Quality > marginal cost |
| **Keyword matching (Phase 1-2)** | Simple, fast | Less precise | YAGNI -- embeddings only if necessary |
| **Sleep cycle at 4am** | Consistent, predictable | Rigid | Sufficient for single user |
| **Haiku for consolidation** | Cheap (10x) | Less capable | Simple tasks, cost critical |

### Progress Overview

```
Phase 1:       [########################] 100% -- COMPLETED (20 tests)
Phase 2:       [########################] 100% -- COMPLETED (14 tests)
Phase 3:       [########################] 100% -- COMPLETED (50 tests)
Phase 4:       [########################] 100% -- COMPLETED (46 tests)
Phase 5:       [########################] 100% -- COMPLETED (43 tests)
Phase 6:       [########################] 100% -- COMPLETED (58 tests)
Phase 6.5:     [########################] 100% -- COMPLETED (30 tests)
Integration:   [########################] 100% -- COMPLETED
Consolidation: [########################] 100% -- COMPLETED (98 tests)
Metacognition: [########################] 100% -- COMPLETED (46 tests)
CLI:           [########################] 100% -- COMPLETED (7 tests)
Phase 7:       [                        ]   0% (future)

Total: 835 tests passing
```

### Future Phase 7 (After Validation -- 6+ Months of Use)

Only if necessary after validation with real usage data:
- Knowledge versioning (revert changes)
- Obsolescence detection (facts >90 days unused)
- Embeddings + vector search (if keyword matching insufficient)
- Multi-modal memory (images, files)
- Analytics dashboard (pattern visualization)

---

## References

### Cognitive Science
- Atkinson, R.C. & Shiffrin, R.M. (1968). Human memory: A proposed system and its control processes. *Psychology of Learning and Motivation*, 2, 89-195.
- Tulving, E. (1972). Episodic and semantic memory. In E. Tulving & W. Donaldson (Eds.), *Organization of Memory* (pp. 381-403). Academic Press.
- Baddeley, A. (2000). The episodic buffer: A new component of working memory? *Trends in Cognitive Sciences*, 4(11), 417-423.
- Stickgold, R. & Walker, M.P. (2013). Sleep-dependent memory triage: Evolving generalization through selective processing. *Nature Neuroscience*, 16(2), 139-145.
- Zacks, J.M. et al. (2007). Event perception: A mind-brain perspective. *Psychological Bulletin*, 133(2), 273-293.

### Personality Psychology
- McCrae, R.R. & Costa, P.T. (1987). Validation of the five-factor model of personality across instruments and observers. *Journal of Personality and Social Psychology*, 52(1), 81-90.
- Markus, H. (1977). Self-schemata and processing information about the self. *Journal of Personality and Social Psychology*, 35(2), 63-78.
- Bowlby, J. (1969). *Attachment and Loss, Vol. 1: Attachment*. Basic Books.

### Prior Art Projects
- Claudio: https://github.com/edgarjs/claudio -- Minimalist Claude CLI to Telegram adapter
- Nanobot: https://github.com/HKUDS/nanobot -- Ultra-lightweight AI agent framework (~3,428 LOC)
- OpenClaw: https://github.com/openclaw/openclaw -- Production-grade AI assistant platform with sophisticated context system
