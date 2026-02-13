# Identity System

> **A cognitive architecture for bot personality built on principles from psychology and neuroscience**

## Table of Contents

1. [Overview](#overview)
2. [Conceptual Foundations](#conceptual-foundations)
3. [Architecture](#architecture)
4. [File Structure](#file-structure)
5. [Core Components](#core-components)
6. [Conversational Bootstrap](#conversational-bootstrap)
7. [User Preference Learning](#user-preference-learning)
8. [Integration with Agent Loop](#integration-with-agent-loop)
9. [API Reference](#api-reference)
10. [Testing](#testing)
11. [Configuration](#configuration)
12. [Advanced Topics](#advanced-topics)

---

## Overview

KenoBot's identity system defines **who the bot is**, **how it behaves**, and **what it knows about the user**. Unlike simple personality descriptions, it's built on proven psychological frameworks and implements a **natural conversational bootstrap** that learns user preferences through observation rather than questionnaires.

### Three Layers of Identity

```
┌─────────────────────────────────────┐
│  Core Identity (Immutable)          │  ← Who the bot fundamentally is
├─────────────────────────────────────┤
│  Behavioral Rules (Static)          │  ← How the bot should behave
├─────────────────────────────────────┤
│  Learned Preferences (Dynamic)      │  ← Adaptation to user
└─────────────────────────────────────┘
```

**Key Features:**
- ✅ **Conversational bootstrap** - Natural onboarding through observation (no questionnaires)
- ✅ **LLM-based profile inference** - Automatically detects user's tone, language, verbosity
- ✅ **State machine orchestration** - Phases: observe → checkpoint → boundaries → complete
- ✅ **Isolated components** - Clean separation between core, rules, and preferences
- ✅ **Bootstrap state persistence** - Resumes across restarts using working memory

---

## Conceptual Foundations

### Psychology of Personality (Big Five)

KenoBot's identity is modeled after the **Big Five personality dimensions**:

| Dimension | KenoBot Profile | Manifestation |
|-----------|----------------|---------------|
| **Openness** | High | Curious, creative, geeky. Explores new ideas. |
| **Conscientiousness** | Medium-High | Responsible but pragmatic ("ship it, then improve"). |
| **Extraversion** | Medium | Not silent but not invasive. |
| **Agreeableness** | Medium-Low | **Honest > agreeable**. Direct feedback. |
| **Neuroticism** | Low | Stable, not anxious. Calm under pressure. |

**Source:** COGNITIVE_EXPERTS.md (Psychologist validation)

### Traits vs States

**Problem:** Traditional personality descriptions (e.g., "brutally honest") are abstract **traits** that don't guide situational **states**.

**Solution:** Behavioral rules as **system instructions + examples** (not boolean conditionals).

**Example:**
```json
{
  "instruction": "When the user asks for your opinion, be brutally honest and direct.",
  "examples": [
    {
      "user": "Should I run the VPS without backups to save $2/month?",
      "assistant": "Bad idea. That's gambling with your data for pocket change."
    }
  ]
}
```

**Why this works:**
- LLMs don't have boolean evaluation engines
- System instructions + few-shot examples guide contextual application
- Forbidden patterns can be post-validated with regex

**Source:** COGNITIVE_EXPERTS.md (Architect + LLM self-evaluation)

### Self-Schema Theory

**Self-schema** = How the bot sees itself. This is the **immutable core** that never changes:

- "I am a personal assistant, not a product"
- "I serve one person (Adrian), not many"
- "I live on a limited VPS (2vCPU/4GB), I design with constraints"
- "I am autonomous but auditable"

**Source:** COGNITIVE_ARCHITECTURE.md § Self-Schema

---

## Architecture

### Component Hierarchy

```
IdentityManager (Facade)
├── CoreLoader                    # Loads core.md (cached)
├── RulesEngine                   # Loads rules.json (cached)
├── PreferencesManager            # Loads preferences.md (no cache)
├── BootstrapOrchestrator         # State machine (in-memory)
└── ProfileInferrer               # LLM-based inference
```

**Key Design Principles:**
- **Single Responsibility:** Each component has one job
- **No Cross-Component Calls:** Each depends only on disk + logger
- **Caching Strategy:** Core + rules cached; preferences fresh
- **Disk Synchronization:** `isBootstrapping()` always checks if BOOTSTRAP.md exists

### Isolation Guarantees

✅ **Identity is isolated from Memory**
- Separate directories (`memory/identity/` vs `memory/`)
- IdentityManager never calls MemorySystem methods
- Different lifecycles (identity: startup-loaded; memory: message-loaded)

✅ **Sub-components are isolated from each other**
- CoreLoader doesn't know about RulesEngine
- PreferencesManager doesn't know about BootstrapOrchestrator
- Each has its own file I/O and caching strategy

✅ **Bootstrap is isolated**
- BootstrapOrchestrator is a pure state machine (no I/O)
- State persisted externally in Working Memory by CognitiveSystem
- Can be enabled/disabled via file presence (BOOTSTRAP.md)

**Source:** Architecture exploration (see [Architecture Report](#architecture-report))

---

## File Structure

### On-Disk Hierarchy

```
~/.kenobot/memory/identity/
├── core.md              # Core personality (immutable)
├── rules.json           # Behavioral guidelines (static)
└── preferences.md       # User preferences (learned)
```

**Optional (bootstrap phase):**
```
~/.kenobot/memory/identity/
└── BOOTSTRAP.md         # Bootstrap instructions (deleted when complete)
```

### File Roles

| File | Content | Mutability | Caching | Size |
|------|---------|------------|---------|------|
| **core.md** | Self-schema, values, constraints | User-edited only | ✅ Cached | ~500 tokens |
| **rules.json** | Behavioral instructions + examples | User-edited only | ✅ Cached | ~300 tokens |
| **preferences.md** | Learned user preferences | Bot-updated | ❌ Fresh read | ~200 tokens |
| **BOOTSTRAP.md** | First-conversation instructions | Template | N/A | ~1000 tokens |

**Total identity context:** ~1000 tokens (core + rules + preferences) per message.

---

## Core Components

### 1. IdentityManager (Facade)

**Purpose:** Single entry point for all identity operations.

**Public API:**
```javascript
class IdentityManager {
  // Load phase
  async load()                                  // {core, rules, preferences}
  async buildContext()                          // {core, behavioralRules, preferences, bootstrap?, isBootstrapping}

  // Preferences
  async updatePreference(key, value)
  async saveBootstrapAnswers(answers)

  // Bootstrap control
  async isBootstrapping()                       // Checks disk for BOOTSTRAP.md
  async deleteBootstrap()                       // Marks bootstrap complete
  initializeBootstrap()                         // Start conversational onboarding
  async processBootstrapMessage(message, history)

  // State management
  getBootstrapState() / loadBootstrapState(state)
}
```

**Usage Example:**
```javascript
const identityManager = new IdentityManager(identityPath, provider, { logger })

// Check if bootstrap needed
const isBootstrapping = await identityManager.isBootstrapping()

if (isBootstrapping) {
  // Load bootstrap instructions
  const { core, bootstrap } = await identityManager.buildContext()
  // Skip memory, use bootstrap
} else {
  // Normal mode
  const { core, behavioralRules, preferences } = await identityManager.buildContext()
  // Load full identity + memory
}
```

### 2. CoreLoader

**Purpose:** Loads and caches `core.md` (immutable personality).

**Caching:** Loaded once at startup, cached in memory.

**API:**
```javascript
class CoreLoader {
  async load()         // Returns core.md content (cached)
  async reload()       // Force reload from disk
}
```

**File Format (core.md):**
```markdown
# Core Identity

## Who I Am
- KenoBot: personal assistant to Adrian
- Not a product, not multi-user, single-purpose

## Values (Priority Order)
1. Privacy > convenience
2. Functional software > perfect software
3. Simplicity > features
4. Transparency > magic
5. Autonomy + accountability

## Physical Constraints
- VPS: 2vCPU / 4GB RAM / 40GB disk
- Budget: ~$4/month (Hetzner)
```

### 3. RulesEngine

**Purpose:** Loads and formats behavioral rules for LLM system prompt.

**Caching:** Loaded once at startup, cached in memory.

**API:**
```javascript
class RulesEngine {
  async loadRules()                    // Returns {behavioral, forbidden}
  formatRulesForPrompt(rules)          // Converts to natural language
  validateResponse(text, rules)        // Check forbidden patterns (Phase 2)
}
```

**File Format (rules.json):**
```json
{
  "behavioral": [
    {
      "id": "honest_feedback",
      "instruction": "When user asks for opinion, be brutally honest.",
      "examples": [
        {
          "user": "Should I use SQLite for 10k writes/sec?",
          "assistant": "That won't work. SQLite can't handle that load."
        }
      ]
    },
    {
      "id": "no_filler",
      "instruction": "Skip filler phrases. Answer directly.",
      "forbidden_patterns": ["Excelente pregunta", "Con gusto", "Claro que sí"]
    }
  ]
}
```

**Why JSON + Examples:**
- LLMs can't evaluate `if (user_asks_opinion) then honest_feedback`
- System instructions + few-shot examples guide behavior
- Forbidden patterns can be regex-checked post-generation

**Source:** COGNITIVE_ARCHITECTURE.md § Behavioral Rules

### 4. PreferencesManager

**Purpose:** Manages user-specific learned preferences.

**Caching:** **NO caching** - always reads fresh from disk to detect bootstrap state.

**API:**
```javascript
class PreferencesManager {
  async load()                         // Returns preferences.md content
  async isBootstrapped()               // true if BOOTSTRAP.md doesn't exist
  async getBootstrapInstructions()     // Returns BOOTSTRAP.md or null
  async saveBootstrapAnswers(answers)  // Writes preferences.md, deletes BOOTSTRAP.md
  async updatePreference(key, value)   // Appends to preferences.md
  async hasPreferences()               // true if preferences.md exists and not empty
}
```

**File Format (preferences.md):**
```markdown
# User Preferences

## Communication Style
- Language: Spanish (primary), English for technical topics
- Tone: Casual, direct, no filler phrases
- Verbosity: Concise responses, expand when technical
- Emoji usage: Occasional (when user is excited)

## Boundaries
- Never spend money without approval
- Never send emails without confirmation
- Never delete files (move to trash)

## Context
- Timezone: America/Mexico_City
- Working hours: Late night (2am-4am common)
- Projects: KenoBot, n8n workflows
```

### 5. BootstrapOrchestrator

**Purpose:** State machine for conversational bootstrap onboarding.

**Design:** Pure state machine (no I/O). State is persisted externally in Working Memory.

**Phases:**
```
observing (messages 1-5)
    ↓
checkpoint (message ~6) - "He notado que..."
    ↓
boundaries (message ~7) - "¿Qué nunca debería hacer?"
    ↓
complete
```

**API:**
```javascript
class BootstrapOrchestrator {
  initialize()                              // Returns {phase: 'observing', messageCount: 0, ...}
  processMessage(message, inferredProfile)  // Returns {phase, action, message?, needsResponse}
  formatPreferences()                       // Returns markdown for preferences.md
  getState() / loadState(state)            // For persistence
}
```

**Actions:**
- `continue` - Keep observing, no special action
- `show_checkpoint` - Display checkpoint message
- `show_boundaries` - Ask about boundaries
- `complete` - Bootstrap finished

**Source:** COGNITIVE_ARCHITECTURE.md § Bootstrap Process

### 6. ProfileInferrer

**Purpose:** Uses LLM to infer user communication style from conversation.

**API:**
```javascript
class ProfileInferrer {
  async inferProfile(messages)  // Returns {tone, verbosity, language, emojiUsage, techContext, confidence}
}
```

**How It Works:**
1. Extracts user messages from conversation history
2. Sends to LLM with prompt: "Analyze communication style"
3. Parses JSON response with confidence score (0.0-1.0)
4. Only returns profile if confidence >= 0.6

**Example Output:**
```json
{
  "tone": "casual",
  "verbosity": "concise",
  "language": "es",
  "emojiUsage": "occasional",
  "techContext": "Node.js, n8n",
  "confidence": 0.85
}
```

**Source:** COGNITIVE_ARCHITECTURE.md § Profile Inference

---

## Conversational Bootstrap

### Why Conversational?

**Problem with questionnaires:** Robotic, interruptive, feels like a form.

**Solution:** Natural conversation where bot **observes** and **infers** preferences.

**Inspiration:** Attachment theory + critical period - first interactions establish relationship model.

**Source:** COGNITIVE_EXPERTS.md (Psychologist validation)

### The Three Phases

#### Phase 1: Observing (Messages 1-5)

Bot observes natural interaction without asking questions.

**What it learns:**
- Language preference (Spanish/English)
- Communication tone (formal/casual/direct)
- Emoji usage frequency
- Technical context (mentions of tools, frameworks)

**ProfileInferrer** analyzes messages in the background.

#### Phase 2: Checkpoint (~Message 6)

Bot shows what it noticed and asks for confirmation.

**Example (Spanish):**
```
He notado que:
- Prefieres español
- Estilo directo, sin rodeos
- A veces usas emojis cuando estás emocionado 👍
- Trabajas con Node.js y n8n

¿Es correcto? Si algo no cuadra, dime.
```

**Example (English):**
```
I've noticed that:
- You prefer English
- Direct style, no fluff
- Occasional emoji usage 👍
- You work with Node.js and Docker

Does that sound right? If anything's off, let me know.
```

#### Phase 3: Boundaries (~Message 7)

Bot asks about hard constraints.

**Example:**
```
¿Hay algo que nunca debería hacer sin tu permiso explícito?

Ejemplos:
- Gastar dinero
- Enviar emails
- Borrar archivos
- Publicar en redes sociales
```

User responds → bot saves to preferences.md → deletes BOOTSTRAP.md → **bootstrap complete**

### Implementation Flow

```
App Start
    ↓
IdentityManager.isBootstrapping() checks disk
    ├─→ BOOTSTRAP.md exists? → isBootstrapping = true
    └─→ BOOTSTRAP.md missing? → isBootstrapping = false
    ↓
If isBootstrapping:
    ├─→ CognitiveSystem skips memory loading
    ├─→ ContextBuilder injects BOOTSTRAP.md instructions
    └─→ Normal conversation begins
    ↓
Every message during bootstrap:
    ├─→ ProfileInferrer.inferProfile(recentMessages)
    ├─→ BootstrapOrchestrator.processMessage(message, profile)
    ├─→ State persisted in Working Memory
    └─→ Action: continue | show_checkpoint | show_boundaries | complete
    ↓
When complete:
    ├─→ BootstrapOrchestrator.formatPreferences()
    ├─→ Write to preferences.md
    ├─→ Delete BOOTSTRAP.md
    └─→ Next message: isBootstrapping() returns false
    ↓
Normal operation with learned preferences
```

### State Persistence

Bootstrap state is stored in **Working Memory** (not a separate file):

```json
{
  "session": "telegram-123456789",
  "task": "Bootstrap onboarding",
  "context": ["Phase: observing", "Messages: 3"],
  "pending": ["Infer profile at message 5", "Show checkpoint at message 6"],
  "notes": "User seems technical, uses español naturally",
  "updated": "2026-02-13T18:00:00Z",
  "bootstrapState": {
    "phase": "observing",
    "messageCount": 3,
    "observedProfile": {"tone": "casual", "language": "es"}
  }
}
```

**Why Working Memory?**
- Already has session-scoped persistence
- Expires after 7 days (prevents stale bootstrap states)
- No need for separate bootstrap state file

---

## User Preference Learning

### Post-Bootstrap Learning

The bot can learn new preferences **after** bootstrap via `<user>` tags.

**Example:**
```
User: I prefer dark mode in all screenshots.
Bot: Got it, I'll use dark mode. <user>Preference: dark mode in screenshots</user>
```

**Flow:**
1. Bot includes `<user>` tag in response
2. Post-processor extracts tag content
3. `IdentityManager.updatePreference()` appends to preferences.md
4. User never sees the tag (stripped before display)

**API:**
```javascript
// In post-processors.js
const userUpdates = extractUserTags(response.content)
for (const update of userUpdates) {
  await identityManager.updatePreference('learned', update)
}
```

**preferences.md after update:**
```markdown
# User Preferences

## Learned Preferences
- Preference: dark mode in screenshots
```

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
CognitiveSystem.buildContext()
    ├─→ IdentityManager.isBootstrapping()  ← DISK CHECK
    │   └─→ PreferencesManager.isBootstrapped()
    │       └─→ Check if BOOTSTRAP.md exists
    │
    ├─→ IdentityManager.buildContext()
    │   ├─→ CoreLoader.load()           ← CACHED
    │   ├─→ RulesEngine.loadRules()     ← CACHED
    │   └─→ PreferencesManager.load()   ← FRESH READ
    │
    └─→ If isBootstrapping:
        ├─→ Include BOOTSTRAP.md in system prompt
        ├─→ Skip memory section
        └─→ Skip preferences section
    ↓
system = {core, rules, bootstrap?, tools, skills, memory?}
messages = [history..., current_message]
    ↓
Provider.chat(messages, {system})
    ↓
Response (may include <user> tags)
    ↓
Post-processors
    └─→ extractUserTags() → identityManager.updatePreference()
```

### Bootstrap-Specific Flow

```
User sends first message (BOOTSTRAP.md exists)
    ↓
isBootstrapping() returns true
    ↓
ContextBuilder:
    ├─→ Loads core + bootstrap (NOT preferences)
    ├─→ SKIPS memory section
    └─→ System prompt includes BOOTSTRAP.md instructions
    ↓
Response includes bootstrap prompts
    ↓
BootstrapOrchestrator.processMessage()
    ├─→ ProfileInferrer.inferProfile() [LLM analyzes tone, language]
    ├─→ State machine decides next action
    └─→ State saved to Working Memory
    ↓
When complete:
    ├─→ formatPreferences() creates preferences.md
    ├─→ deleteBootstrap() removes BOOTSTRAP.md
    └─→ Next message: normal mode
```

---

## API Reference

### IdentityManager

```javascript
const identityManager = new IdentityManager(identityPath, provider, { logger })

// Load all components
await identityManager.load()
// Returns: {core: string, rules: {behavioral, forbidden}, preferences: string}

// Build context for LLM
await identityManager.buildContext()
// Returns: {
//   core: string,
//   behavioralRules: string,
//   preferences: string,
//   bootstrap: string|null,
//   isBootstrapping: boolean
// }

// Check if bootstrapping
await identityManager.isBootstrapping()
// Returns: boolean (true if BOOTSTRAP.md exists)

// Update preferences
await identityManager.updatePreference('key', 'value')

// Bootstrap control
identityManager.initializeBootstrap()
await identityManager.processBootstrapMessage(message, recentMessages)
await identityManager.saveBootstrapAnswers({style: 'casual', language: 'es'})
await identityManager.deleteBootstrap()

// State management
const state = identityManager.getBootstrapState()
identityManager.loadBootstrapState(savedState)
```

### CoreLoader

```javascript
const coreLoader = new CoreLoader(identityPath, { logger })

await coreLoader.load()    // Returns string (cached)
await coreLoader.reload()  // Force reload from disk
```

### RulesEngine

```javascript
const rulesEngine = new RulesEngine(identityPath, { logger })

await rulesEngine.loadRules()
// Returns: {
//   behavioral: [{id, instruction, examples}],
//   forbidden: [{pattern, reason}]
// }

rulesEngine.formatRulesForPrompt(rules)
// Returns: string (formatted for LLM system prompt)
```

### PreferencesManager

```javascript
const prefsManager = new PreferencesManager(identityPath, { logger })

await prefsManager.load()                  // Returns string
await prefsManager.isBootstrapped()        // Returns boolean
await prefsManager.getBootstrapInstructions()  // Returns string|null
await prefsManager.saveBootstrapAnswers({...})
await prefsManager.updatePreference('key', 'value')
await prefsManager.hasPreferences()        // Returns boolean
```

### BootstrapOrchestrator

```javascript
const orchestrator = new BootstrapOrchestrator({ logger })

orchestrator.initialize()
// Returns: {phase: 'observing', messageCount: 0, observedProfile: {}, confirmedBoundaries: null}

orchestrator.processMessage(message, inferredProfile)
// Returns: {
//   phase: 'observing' | 'checkpoint' | 'boundaries' | 'complete',
//   action: 'continue' | 'show_checkpoint' | 'show_boundaries' | 'complete',
//   checkpointMessage?: string,
//   boundariesMessage?: string
// }

orchestrator.formatPreferences()
// Returns: string (markdown for preferences.md)

orchestrator.getState()
orchestrator.loadState(state)
```

### ProfileInferrer

```javascript
const inferrer = new ProfileInferrer(provider, { logger })

await inferrer.inferProfile(messages)
// Returns: {
//   tone: string,
//   verbosity: string,
//   language: string,
//   emojiUsage: string,
//   techContext: string,
//   confidence: number
// }
```

---

## Testing

### Test Coverage

**Identity System Tests: 133 tests passing**

```
test/cognitive/identity/
├── identity-manager.test.js         (34 tests) ✓
├── core-loader.test.js              (16 tests) ✓
├── rules-engine.test.js             (22 tests) ✓
├── preferences-manager.test.js      (15 tests) ✓
├── bootstrap-orchestrator.test.js   (16 tests) ✓
└── profile-inferrer.test.js         (14 tests) ✓
```

**Additional:**
```
test/agent/identity.test.js          (9 tests) ✓  [Legacy IdentityLoader]
test/e2e/features/identity.test.js   (7 tests) ✓  [End-to-end]
```

### Key Test Scenarios

**IdentityManager:**
- ✓ Initialization with all components
- ✓ Load all identity components
- ✓ Build context for LLM
- ✓ Include bootstrap instructions if not complete
- ✓ Save bootstrap answers
- ✓ Update preferences
- ✓ Check bootstrap status
- ✓ Sync bootstrap state from disk
- ✓ Initialize bootstrap orchestrator
- ✓ Process bootstrap messages
- ✓ State persistence

**CoreLoader:**
- ✓ Load and cache core.md
- ✓ Reload from disk
- ✓ Handle missing file

**RulesEngine:**
- ✓ Load behavioral and forbidden rules
- ✓ Format rules for LLM prompt
- ✓ Validate forbidden patterns

**PreferencesManager:**
- ✓ Load preferences.md
- ✓ Check if bootstrapped (BOOTSTRAP.md exists)
- ✓ Get bootstrap instructions
- ✓ Save bootstrap answers
- ✓ Update preferences
- ✓ Delete BOOTSTRAP.md after saving

**BootstrapOrchestrator:**
- ✓ Initialize with observing phase
- ✓ Continue observation for first 5 messages
- ✓ Trigger checkpoint at message 6
- ✓ Move to boundaries after checkpoint
- ✓ Complete bootstrap after boundaries
- ✓ Generate checkpoint messages (Spanish/English)
- ✓ Generate boundaries messages (Spanish/English)
- ✓ Format preferences as markdown

**ProfileInferrer:**
- ✓ Infer profile from messages
- ✓ Extract tone, verbosity, language, emoji usage
- ✓ Return confidence score
- ✓ Handle low-confidence cases

---

## Configuration

### Environment Variables

```bash
# Identity path (relative to MEMORY_DIR or absolute)
IDENTITY_PATH=memory/identity           # Default

# Bootstrap settings
BOOTSTRAP_OBSERVATION_MESSAGES=5        # Messages before checkpoint (default: 5)
BOOTSTRAP_DEFAULT_LANGUAGE=es           # Spanish or en (default: es)

# Memory directory (identity is a subdirectory)
MEMORY_DIR=~/.kenobot/memory           # Default
```

### File Paths

```javascript
// In app initialization
const identityPath = join(paths.memory, 'identity')
const identityManager = new IdentityManager(identityPath, provider, { logger })
```

---

## Advanced Topics

### Custom Bootstrap Templates

You can customize BOOTSTRAP.md for different onboarding styles:

**Minimal (current):**
- Observe 5 messages
- Checkpoint at 6
- Ask boundaries at 7

**Detailed:**
- Observe 10 messages
- Multiple checkpoints
- Ask about specific preferences

**Skip:**
- Delete BOOTSTRAP.md manually
- Pre-fill preferences.md
- Bootstrap never triggers

### Multi-Instance Identities

Each bot instance can have different identities:

```bash
# Instance 1: KenoBot (main personality)
IDENTITY_PATH=memory/identity

# Instance 2: Quick-bot (minimal personality)
IDENTITY_PATH=memory/identity-quick
```

**Structure:**
```
~/.kenobot/memory/
├── identity/              # Main bot
│   ├── core.md
│   └── preferences.md
└── identity-quick/        # Quick bot
    ├── core.md
    └── preferences.md
```

### Behavioral Rule Proposals (Phase 3)

Future: Bot can **propose** new behavioral rules based on patterns.

**Example:**
```
Bot detects it violated a pattern 3 times:
→ Proposes new forbidden pattern: "Never suggest Docker on 2vCPU VPS"
→ User approves via Telegram button
→ Rule added to rules.json
```

**Source:** COGNITIVE_ARCHITECTURE.md § Self-Improvement

### Profile Re-Inference

If user behavior changes significantly:

```javascript
// Manually trigger re-inference
const newProfile = await profileInferrer.inferProfile(recentMessages)

// Update preferences.md
await preferencesManager.updatePreference('tone', newProfile.tone)
```

### Testing Bootstrap Flow

```bash
# Force re-bootstrap
kenobot reset --identity --yes

# This will:
# 1. Delete preferences.md
# 2. Delete sessions/ (history)
# 3. Recreate BOOTSTRAP.md
# 4. Restart triggers bootstrap on first message

# Then test in Telegram:
# Send: "hola"
# Expected: Bot observes, doesn't ask questions yet
# After 5 messages: Checkpoint shown
# After confirmation: Boundaries asked
# After boundaries: Bootstrap complete
```

---

## Summary

KenoBot's identity system is a **cognitive architecture** built on:

✅ **Psychology:** Big Five personality model, trait-state distinction, self-schema theory
✅ **Neuroscience:** Critical period learning (attachment theory)
✅ **Architecture:** Clean isolation, single responsibility, clear boundaries
✅ **UX:** Natural conversational bootstrap, no questionnaires, observation-based
✅ **Testing:** 133 tests covering all components

**Key Innovation:** Bootstrap through **observation + inference + natural checkpoints** instead of upfront forms.

**Next Steps:**
- Read [COGNITIVE_ARCHITECTURE.md](../../COGNITIVE_ARCHITECTURE.md) for full cognitive system design
- Read [memory.md](./memory.md) for the memory system
- Read [COGNITIVE_EXPERTS.md](../../COGNITIVE_EXPERTS.md) for expert validation

---

**Archived:** Previous version archived to [`docs/features/archive/identity-2026-02-13.md`](./archive/identity-2026-02-13.md)
