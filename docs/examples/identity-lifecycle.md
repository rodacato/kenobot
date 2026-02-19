# Identity Lifecycle — Complete Example

> **From first boot to personality evolution over time**
>
> *Companion to [Identity System](../identity.md)*

## Table of Contents

1. [The Scenario](#the-scenario)
2. [Phase 1: Setup — Scaffolding Identity Files](#phase-1-setup--scaffolding-identity-files)
3. [Phase 2: First Boot — Bootstrap Detection](#phase-2-first-boot--bootstrap-detection)
4. [Phase 3: First Message — Greeting with Bootstrap Active](#phase-3-first-message--greeting-with-bootstrap-active)
5. [Phase 4: Observation Phase (Messages 1-5)](#phase-4-observation-phase-messages-1-5)
6. [Phase 5: Checkpoint (Message 6)](#phase-5-checkpoint-message-6)
7. [Phase 6: Boundaries (Message 7)](#phase-6-boundaries-message-7)
8. [Phase 7: Bootstrap Completion](#phase-7-bootstrap-completion)
9. [Phase 8: Normal Operation — Identity in Every Message](#phase-8-normal-operation--identity-in-every-message)
10. [Phase 9: Identity Evolution Over Time](#phase-9-identity-evolution-over-time)
11. [Complete Timeline](#complete-timeline)
12. [Actors Reference](#actors-reference)

---

## The Scenario

**User:** Adrian, a developer in Mexico City
**Date:** February 14, 2026
**Event:** Fresh KenoBot installation — first-ever conversation

---

## Phase 1: Setup — Scaffolding Identity Files

Adrian runs `kenobot setup`. The CLI scaffolds the identity directory:

```
kenobot setup
        ↓
init-cognitive.js
  ├─ mkdir ~/.kenobot/memory/identity/
  ├─ Copy SOUL.md → core.md
  ├─ Create rules.json (template)
  ├─ Create preferences.md (empty template)
  └─ Copy BOOTSTRAP.md (triggers bootstrap mode)
```

**Resulting filesystem:**

```
~/.kenobot/memory/identity/
├── core.md              ← Copied from templates/identities/kenobot/SOUL.md
│   │ # KenoBot
│   │ Personal AI assistant to Adrian. Casual but competent.
│   │ Brutally honest. Adaptive language...
│   │
├── rules.json           ← Behavioral guidelines
│   │ { "behavioral": [...], "forbidden": [...] }
│   │
├── preferences.md       ← Empty template (will be filled during bootstrap)
│   │ # User Preferences
│   │ ## Communication Style (observed)
│   │ - Length: (pending)
│   │ - Tone: (pending)
│   │ ...
│   │
└── BOOTSTRAP.md         ← EXISTS = bootstrap mode active
    │ # Hey, I just came online.
    │ _Fresh start. No memories yet._
    │ ...
```

**Key insight:** The existence of `BOOTSTRAP.md` is the signal that bootstrap is needed. No flags, no database — just a file on disk.

**Actor:** `init-cognitive.js` (`src/cli/init-cognitive.js`)

---

## Phase 2: First Boot — Bootstrap Detection

Adrian starts the bot with `kenobot start`. During initialization:

```
index.js → app.js:createApp()
        ↓
CognitiveSystem constructor
  ├─ MemorySystem (memory store)
  ├─ IdentityManager(identityPath, provider)
  │   ├─ CoreLoader(identityPath)        → will load core.md
  │   ├─ RulesEngine(identityPath)       → will load rules.json
  │   ├─ PreferencesManager(identityPath) → will check BOOTSTRAP.md
  │   ├─ BootstrapOrchestrator()         → state machine (starts idle)
  │   └─ ProfileInferrer(provider)       → LLM-based inference
  ├─ RetrievalEngine(memorySystem)
  └─ MetacognitionSystem()
        ↓
ContextBuilder(config, storage, cognitive)
        ↓
AgentLoop.start()
  → bus.on('message:in', handler)
```

**No bootstrap logic runs yet** — everything is lazy-loaded on first message.

---

## Phase 3: First Message — Greeting with Bootstrap Active

Adrian sends his first Telegram message:

> "Hola, soy Adrian. Necesito ayuda con mi proyecto de Node.js"

```
TelegramChannel → bus.fire('message:in', {...})
        ↓
AgentLoop._handleMessage(message)
  ├─ Load session history from storage
  ├─ cognitive.processBootstrapIfActive(sessionId, message, history)
  │   → isBootstrapping? YES → orchestrator processes message
  │   → message 1 → action: "continue" (no injection needed)
  │
  └─ ContextBuilder.build(sessionId, message, { bootstrapAction, history })
        ↓
ContextBuilder._buildSystemPrompt(messageText, sessionId, bootstrapAction)
        ↓
IdentityManager.buildContext()
  │
  ├─ 1. CoreLoader.load()
  │   → Reads ~/.kenobot/memory/identity/core.md
  │   → CACHES in memory (immutable, never re-read unless reload())
  │   → Returns: "# KenoBot\nPersonal AI assistant..."
  │
  ├─ 2. RulesEngine.loadRules()
  │   → Reads ~/.kenobot/memory/identity/rules.json
  │   → CACHES in memory (static)
  │   → Returns: { behavioral: [...], forbidden: [...] }
  │   → formatRulesForPrompt() → natural language instructions
  │
  ├─ 3. PreferencesManager.load()
  │   → Reads ~/.kenobot/memory/identity/preferences.md
  │   → FRESH read (never cached — dynamic)
  │   → Returns: "# User Preferences\n## Communication Style\n- Length: (pending)..."
  │
  └─ 4. isBootstrapping()
      → PreferencesManager.isBootstrapped()
          → fs.access(BOOTSTRAP.md)
          → FILE EXISTS → returns false (NOT bootstrapped)
      → isBootstrapping = !false = TRUE
      │
      └─ Load BOOTSTRAP.md content
         → Returns 165-line onboarding instruction document
```

**System prompt assembled (bootstrap mode):**

```
[Core Identity — core.md]
  # KenoBot
  Personal AI assistant to Adrian...

---
[Behavioral Rules — rules.json formatted]
  - When user asks opinion, be brutally honest...

---
## First Conversation — Bootstrap
  # Hey, I just came online.
  _Fresh start. No memories yet._

  ## The Approach: Observe First, Ask Second
  Phase 1: Observation (first 3-5 messages)
  - Start with a warm, natural greeting...
  ...

⚠️ NO PREFERENCES SECTION (skipped during bootstrap)
⚠️ NO MEMORY SECTION (skipped during bootstrap)
```

**What's different from normal mode:**
1. Preferences are **skipped** (not loaded into system prompt)
2. Memory is **skipped** (CognitiveSystem returns empty memory)
3. BOOTSTRAP.md is **injected** as "First Conversation" instructions
4. The LLM sees the bootstrap protocol and knows to observe, not interrogate

**Claude responds:**

```
Hey! Acabo de conectarme — soy KenoBot. Primera vez que hablamos, ¿no?
Mucho gusto, Adrian! Ya veo que andas con Node.js.
Cuéntame más — ¿qué tipo de proyecto es? ¿API, CLI, bot?

<working-memory>
- User: Adrian
- Tech: Node.js project (type unknown)
- Language: Spanish
- Bootstrap phase: observing (message 1)
</working-memory>
```

**Post-processors run:**
- `working-memory` post-processor → saves scratchpad to `working/telegram-123456789.md`
- `bootstrap` post-processor → checks for `<bootstrap-complete/>` → NOT found → skip
- Clean text sent to Adrian (without `<working-memory>` tags)

---

## Phase 4: Observation Phase (Messages 1-5)

Over the next 5 messages, Adrian chats naturally. The bot helps him with real tasks while silently observing his style.

### Message 2 — Adrian

> "Es un bot de Telegram, igual que tú. Usa Grammy y tiene un scheduler con cron"

### Message 3 — Adrian

> "oye tmb tengo un error con n8n, me da 401 en un webhook"

### Message 4 — Adrian

> "ya lo arreglé, era que necesitaba query params en vez de headers lol"

### Message 5 — Adrian

> "cambiando de tema — puedes ayudarme a refactorizar el storage? quiero separar la lógica de archivos"

**Behind the scenes on each message:**

```
For EACH message:
        ↓
CognitiveSystem.processBootstrapIfActive(sessionId, message, history)
  ├─ isBootstrapping? → YES (BOOTSTRAP.md still exists)
  │
  ├─ _loadBootstrapState(sessionId)
  │   → Read working memory → bootstrapState
  │   → Load into BootstrapOrchestrator
  │
  ├─ ProfileInferrer.inferProfile(conversationHistory)
  │   → Sends recent messages to Claude API (cheap, fast call)
  │   → Prompt: "Analyze this conversation. What tone, language, verbosity?"
  │   → Response:
  │     {
  │       tone: "casual",
  │       verbosity: "concise",
  │       language: "es",
  │       emojiUsage: "none",
  │       techContext: "Node.js, Telegram bots, n8n, Grammy",
  │       confidence: 0.85
  │     }
  │
  ├─ BootstrapOrchestrator.processMessage(message, inferredProfile)
  │   → messageCount++ (now 2, 3, 4, 5)
  │   → Updates observedProfile with inferred data
  │   → phase: "observing"
  │   → action: "continue" (not yet 6 messages)
  │
  └─ _saveBootstrapState(sessionId, state)
      → Save to working memory:
        {
          "bootstrapState": {
            "phase": "observing",
            "messageCount": 5,
            "observedProfile": {
              "tone": "casual",
              "verbosity": "concise",
              "language": "es",
              "emojiUsage": "none",
              "techContext": "Node.js, Telegram bots, n8n, Grammy"
            },
            "confirmedBoundaries": null
          }
        }
```

**Actors involved per message during observation:**
| Actor | File | Role |
|-------|------|------|
| `CognitiveSystem` | `src/domain/cognitive/index.js` | Orchestrates bootstrap check |
| `IdentityManager` | `src/domain/cognitive/identity/identity-manager.js` | Delegates to sub-components |
| `PreferencesManager` | `src/domain/cognitive/identity/preferences-manager.js` | Checks BOOTSTRAP.md on disk |
| `ProfileInferrer` | `src/domain/cognitive/identity/profile-inferrer.js` | LLM-based style inference |
| `BootstrapOrchestrator` | `src/domain/cognitive/identity/bootstrap-orchestrator.js` | State machine |
| `WorkingMemory` | `src/domain/cognitive/memory/working-memory.js` | Persists bootstrap state |

---

## Phase 5: Checkpoint (Message 6)

### Message 6 — Adrian

> "y de paso, ¿puedes revisar si el provider de Gemini maneja bien los roles?"

The state machine triggers the checkpoint:

```
BootstrapOrchestrator.processMessage(message, inferredProfile)
  → messageCount++ → now 6
  → 6 >= 6 → TRIGGER CHECKPOINT
  → phase: "observing" → "checkpoint"
        ↓
_generateCheckpointMessage()
  → observedProfile.language = "es" → Spanish checkpoint
  → Generates:

  "Hey, ya llevamos varias conversaciones. He notado que:

  - Prefieres respuestas cortas y directas ✅
  - Tu tono es casual y directo ✅
  - Trabajas con Node.js, Telegram bots, n8n, Grammy ✅

  ¿Voy bien o ajusto algo?"
```

**The bot includes this checkpoint message in its response** to Adrian. It's a natural confirmation, not a form.

**Return value:**
```javascript
{
  phase: 'checkpoint',
  action: 'show_checkpoint',
  checkpointMessage: "Hey, ya llevamos varias conversaciones..."
}
```

AgentLoop passes this as `bootstrapAction` to ContextBuilder, which appends a "Bootstrap Action — Checkpoint" section to the system prompt. The LLM sees the checkpoint message and weaves it naturally into the response about Gemini roles, ending with the confirmation question.

---

## Phase 6: Boundaries (Message 7)

### Message 7 — Adrian

> "Sí, vas bien. Solo agrega que uso mucho VPS con Hetzner y que mi timezone es CST (México)"

Adrian confirms the checkpoint and adds details. The state machine transitions:

```
BootstrapOrchestrator.processMessage(message, inferredProfile)
  → phase: "checkpoint" → _handleCheckpoint(message)
  → Saves user's corrections/additions
  → phase: "checkpoint" → "boundaries"
        ↓
_generateBoundariesMessage()
  → language: "es" → Spanish boundaries question
  → Generates:

  "Perfecto! Una última cosa importante:

  ¿Hay algo que NUNCA debería hacer sin preguntarte primero?
  (por ejemplo: push a remote, borrar archivos, comandos destructivos...)

  Límites comunes que la gente establece:
  - Preguntar antes de push a remote
  - No borrar archivos importantes
  - No ejecutar comandos destructivos en producción
  - Confirmar antes de hacer llamadas a APIs externas

  ¿Cuáles son tus líneas rojas?"
```

**Return value:**
```javascript
{
  phase: 'boundaries',
  action: 'show_boundaries',
  boundariesMessage: "Perfecto! Una última cosa importante..."
}
```

### Message 8 — Adrian

> "Nunca hagas push sin preguntarme. No borres archivos a menos que sean temporales. Y no gastes dinero en APIs sin confirmar."

```
BootstrapOrchestrator.processMessage(message, inferredProfile)
  → phase: "boundaries" → _handleBoundaries(message)
  → confirmedBoundaries = "Nunca hagas push sin preguntarme..."
  → phase: "boundaries" → "complete"
        ↓
Return: { phase: 'complete', action: 'complete', boundaries: message }
        ↓
IdentityManager._saveBootstrapPreferences()
  │
  ├─ BootstrapOrchestrator.formatPreferences()
  │   → Generates preferences.md:
  │
  │   # User Preferences
  │
  │   ## Communication Style (observed)
  │   - Length: concise
  │   - Tone: casual
  │   - Language: es
  │   - Emojis: none
  │
  │   ## Technical Context (observed)
  │   - Primary tech: Node.js, Telegram bots, n8n, Grammy
  │
  │   ## Boundaries (explicitly stated)
  │   Nunca hagas push sin preguntarme. No borres archivos a menos
  │   que sean temporales. Y no gastes dinero en APIs sin confirmar.
  │
  │   ## Bootstrap Info
  │   - Completed: 2026-02-14
  │   - Messages until checkpoint: 8
  │
  └─ writeFile(preferences.md, content)     ← WRITES preferences
     (BOOTSTRAP.md NOT deleted yet — post-processor handles it)
```

**Then ContextBuilder injects completion instruction:**
```
ContextBuilder._buildSystemPrompt(messageText, sessionId, bootstrapAction)
  → bootstrapAction.action === 'complete'
  → Appends: "Bootstrap Action — Complete:
     The user has completed onboarding. Wrap up naturally
     and include <bootstrap-complete/> in your response."
```

---

## Phase 7: Bootstrap Completion

The LLM includes `<bootstrap-complete/>` in its response:

```
Perfecto! Ya tenemos lo básico. Te iré conociendo mejor conforme
trabajemos juntos. Si en algún momento quieres que ajuste mi estilo,
nomás dime. ¿Seguimos con lo que necesitabas?

<bootstrap-complete/>
```

**Post-processor pipeline catches it:**

```
runPostProcessors(response)
        ↓
[5. bootstrap post-processor]
  ├─ extractBootstrapComplete(text)
  │   → regex: /<bootstrap-complete\s*\/?>/
  │   → FOUND! isComplete = true
  │   → cleanText = "Perfecto! Ya tenemos lo básico..."  (tag removed)
  │
  └─ apply({ isComplete: true }, { cognitive, bus })
      ├─ cognitive.getIdentityManager().deleteBootstrap()
      │   → unlink(~/.kenobot/memory/identity/BOOTSTRAP.md)
      │   → IdentityManager.isBootstrapped = true
      │
      └─ bus.fire('config:changed', { reason: 'bootstrap complete' })
```

**Filesystem after bootstrap completion:**

```
~/.kenobot/memory/identity/
├── core.md              ← Unchanged (immutable)
├── rules.json           ← Unchanged (static)
├── preferences.md       ← UPDATED with observed preferences
│   │ # User Preferences
│   │ ## Communication Style (observed)
│   │ - Length: concise
│   │ - Tone: casual
│   │ - Language: es
│   │ - Emojis: none
│   │ ## Technical Context (observed)
│   │ - Primary tech: Node.js, Telegram bots, n8n, Grammy
│   │ ## Boundaries (explicitly stated)
│   │ Nunca hagas push sin preguntarme...
│   │
└── (BOOTSTRAP.md DELETED — no longer exists)
```

**BOOTSTRAP.md is gone.** From now on, every `isBootstrapping()` check returns `false`.

---

## Phase 8: Normal Operation — Identity in Every Message

From message 9 onwards, every message uses the full identity + memory system:

```
ContextBuilder._buildSystemPrompt()
        ↓
IdentityManager.buildContext()
  ├─ CoreLoader.load() → cached core.md
  ├─ RulesEngine.loadRules() → cached rules.json
  ├─ PreferencesManager.load() → FRESH read of preferences.md
  ├─ isBootstrapping() → BOOTSTRAP.md doesn't exist → false
  └─ bootstrap = null (not loaded)
        ↓
System prompt assembled (NORMAL mode):

  [Core Identity — core.md]
    # KenoBot
    Personal AI assistant to Adrian...

  ---
  [Behavioral Rules — rules.json formatted]
    - When user asks opinion, be brutally honest...

  ---
  ## Preferences                        ← NOW INCLUDED (was skipped before)
    # User Preferences
    - Length: concise
    - Tone: casual
    - Language: es
    - Boundaries: No push, no delete...

  ---
  ## Memory                             ← NOW INCLUDED (was skipped before)
    ### Memory tags
    | Tag | Use for | Scope |
    ...
    ### Long-term memory
    [MEMORY.md contents]
    ### Recent notes
    [daily logs]
```

**What changed from bootstrap mode:**
1. Preferences **loaded** into system prompt
2. Memory **loaded** into system prompt
3. BOOTSTRAP.md **not loaded** (doesn't exist)
4. LLM operates with full context — knows Adrian, his style, his boundaries

---

## Phase 9: Identity Evolution Over Time

Identity isn't frozen after bootstrap. It evolves through three mechanisms:

### 9.1 — `<user>` Tags (Immediate Update)

**March 2026** — Adrian says:

> "De ahora en adelante prefiero que me contestes en inglés cuando hablemos de código"

The LLM recognizes a preference update and responds:

```
Got it! I'll switch to English for technical discussions.

<user>Prefers English for code discussions, Spanish for personal topics</user>
```

**Post-processor pipeline:**

```
[4. user post-processor]
  ├─ extractUserUpdates(text)
  │   → regex: /<user>([\s\S]*?)<\/user>/g
  │   → finds: "Prefers English for code discussions..."
  │
  └─ apply({ updates }, { cognitive, bus })
      └─ identityManager.updatePreference('learned', update)
          └─ preferencesManager.updatePreference('learned', update)
              └─ APPENDS to preferences.md:
                 ## Learned
                 - Prefers English for code discussions, Spanish for personal topics
```

**preferences.md after update:**

```markdown
# User Preferences

## Communication Style (observed)
- Length: concise
- Tone: casual
- Language: es
- Emojis: none

## Technical Context (observed)
- Primary tech: Node.js, Telegram bots, n8n, Grammy

## Boundaries (explicitly stated)
Nunca hagas push sin preguntarme...

## Bootstrap Info
- Completed: 2026-02-14
- Messages until checkpoint: 8

## Learned
- Prefers English for code discussions, Spanish for personal topics
```

### 9.2 — Consolidation (Sleep Cycle Reinforcement)

**Nightly at ~4am** — The sleep cycle can indirectly affect identity through memory:

```
Consolidator.run()
  → Extracts facts like "Adrian prefers English for code" from daily logs
  → Writes to MEMORY.md (semantic memory)
  → The LLM sees this in its memory context, reinforcing the preference
```

Identity files themselves (`core.md`, `rules.json`) are NOT modified by the sleep cycle. Only `preferences.md` changes through explicit `<user>` tags.

### 9.3 — Accumulation Pattern

Over months, `preferences.md` grows as the bot learns more:

**June 2026:**

```markdown
# User Preferences

## Communication Style (observed)
- Length: concise
- Tone: casual
- Language: es
- Emojis: none

## Technical Context (observed)
- Primary tech: Node.js, Telegram bots, n8n, Grammy

## Boundaries (explicitly stated)
Nunca hagas push sin preguntarme...

## Bootstrap Info
- Completed: 2026-02-14
- Messages until checkpoint: 8

## Learned
- Prefers English for code discussions, Spanish for personal topics
- Uses Hetzner VPS (2vCPU/4GB/40GB) at ~$4/month
- Timezone: America/Mexico_City (CST/CDT)
- Prefers vitest over jest for testing
- Uses VS Code as primary editor
- SSH key naming convention: id_ed25519_{service}
- Doesn't like unnecessary abstractions
- Prefers flat directory structures over deep nesting
```

**Each `<user>` tag appends to the "Learned" section.** The file grows but never shrinks (no deduplication of preferences). This is by design — preferences are explicit and should not be pruned automatically.

### 9.4 — Caching Behavior Summary

| Component | Cached? | Why | When Re-read |
|-----------|---------|-----|-------------|
| `core.md` | YES | Immutable personality | Only on `reload()` |
| `rules.json` | YES | Static guidelines | Only on `reload()` |
| `preferences.md` | NO | Changes via `<user>` tags | Every message |

This design means preference updates take effect **immediately** on the next message — no restart needed.

---

## Complete Timeline

```
Day 0 — SETUP
  kenobot setup
    ├─ Create identity directory
    ├─ Copy SOUL.md → core.md
    ├─ Create rules.json template
    ├─ Create preferences.md template (empty)
    └─ Copy BOOTSTRAP.md (enables bootstrap mode)

Day 0 — FIRST BOOT
  kenobot start
    └─ CognitiveSystem initialized (lazy loading)

Day 0, Message 1 — BOOTSTRAP BEGINS
  ├─ isBootstrapping() → BOOTSTRAP.md exists → true
  ├─ System prompt: core + rules + BOOTSTRAP.md (NO preferences, NO memory)
  ├─ LLM follows bootstrap protocol: warm greeting
  └─ Working memory saves bootstrap state

Day 0, Messages 2-5 — OBSERVATION PHASE
  ├─ ProfileInferrer analyzes conversation with each message
  ├─ BootstrapOrchestrator tracks: tone=casual, lang=es, verbosity=concise
  ├─ LLM helps with real tasks while observing
  └─ Bootstrap state persisted in working memory

Day 0, Message 6 — CHECKPOINT
  ├─ BootstrapOrchestrator triggers checkpoint
  ├─ LLM presents observed preferences naturally
  └─ User confirms or adjusts

Day 0, Message 7 — BOUNDARIES
  ├─ BootstrapOrchestrator asks about red lines
  └─ User states boundaries explicitly

Day 0, Message 8 — BOOTSTRAP COMPLETE
  ├─ BootstrapOrchestrator.formatPreferences() → generates preferences.md
  ├─ Writes preferences.md with observed data
  ├─ LLM includes <bootstrap-complete/> in response
  ├─ Post-processor deletes BOOTSTRAP.md
  ├─ bus.fire('config:changed')
  └─ From now on: full identity + memory in every message

Day 0+, Messages 9+ — NORMAL OPERATION
  ├─ System prompt: core + rules + preferences + memory
  ├─ Preferences fresh-read every message
  └─ Memory system fully active

Over time — IDENTITY EVOLUTION
  ├─ <user> tags → append to preferences.md → immediate effect
  ├─ Consolidation → reinforces in MEMORY.md → indirect
  └─ preferences.md grows with learned knowledge
```

---

## Actors Reference

### Bootstrap Phase

| Actor | File | Role |
|-------|------|------|
| `init-cognitive.js` | `src/cli/init-cognitive.js` | Scaffolds identity files |
| `IdentityManager` | `src/domain/cognitive/identity/identity-manager.js` | Facade for all identity ops |
| `CoreLoader` | `src/domain/cognitive/identity/core-loader.js` | Loads + caches core.md |
| `RulesEngine` | `src/domain/cognitive/identity/rules-engine.js` | Loads + formats rules.json |
| `PreferencesManager` | `src/domain/cognitive/identity/preferences-manager.js` | Manages preferences.md + BOOTSTRAP.md |
| `BootstrapOrchestrator` | `src/domain/cognitive/identity/bootstrap-orchestrator.js` | State machine (observe/checkpoint/boundaries/complete) |
| `ProfileInferrer` | `src/domain/cognitive/identity/profile-inferrer.js` | LLM-based style inference |
| `CognitiveSystem` | `src/domain/cognitive/index.js` | Orchestrates bootstrap + memory isolation |
| `ContextBuilder` | `src/application/context.js` | Builds system prompt (gates bootstrap mode) |

### Completion Phase

| Actor | File | Role |
|-------|------|------|
| `extractBootstrapComplete` | `src/application/extractors/bootstrap.js` | Detects `<bootstrap-complete/>` tag |
| `runPostProcessors` | `src/application/post-processors.js` | Pipeline that triggers deletion |
| `IdentityManager.deleteBootstrap()` | `src/domain/cognitive/identity/identity-manager.js` | Deletes BOOTSTRAP.md |
| `NervousSystem` (bus) | `src/domain/nervous/bus.js` | Fires `config:changed` signal |

### Evolution Phase

| Actor | File | Role |
|-------|------|------|
| `extractUserUpdates` | `src/application/extractors/user.js` | Parses `<user>` tags |
| `runPostProcessors` | `src/application/post-processors.js` | Routes updates to identity |
| `IdentityManager.updatePreference()` | `src/domain/cognitive/identity/identity-manager.js` | Appends to preferences.md |
| `PreferencesManager.updatePreference()` | `src/domain/cognitive/identity/preferences-manager.js` | Filesystem write |

### Three Layers of Identity

| Layer | File | Mutability | Caching |
|-------|------|-----------|---------|
| Core (who the bot is) | `core.md` | Immutable | Cached forever |
| Rules (how to behave) | `rules.json` | Static (manual edit only) | Cached forever |
| Preferences (user adaptation) | `preferences.md` | Dynamic (`<user>` tags) | Never cached |
