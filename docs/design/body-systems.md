# Body Systems — Architecture Proposal

> Comprehensive survey of proposed subsystems beyond the Cognitive System and Nervous System, using the human body as architectural metaphor.

**Date**: 2026-02-14
**Status**: Research

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| John Laird, Allen Newell, Paul Rosenbloom | Cognitive Architecture | SOAR (1987) | Impasse detection, goal stacking, sub-goal creation |
| John R. Anderson | Cognitive Architecture | ACT-R (1993, 2007) | Activation-based retrieval, buffer capacity limits |
| Michael Bratman; Anand Rao & Michael Georgeff | Practical Reasoning / Agent Theory | BDI Model (1987; 1995) | Beliefs-Desires-Intentions framework for autonomous agents |
| Ron Sun | Cognitive Architecture | CLARION (2002, 2006) | Dual-process architecture, motivational subsystem |
| Stan Franklin | Cognitive Architecture | LIDA (2006) | Global Workspace implementation, attention codelets |
| Bernard Baars | Consciousness Theory | Global Workspace Theory (1988) | Consciousness as broadcast mechanism, selective attention |
| Marvin Minsky | AI / Cognitive Science | The Society of Mind (1986) | Emotions as resource allocation, censors and suppressors |
| William T. Powers | Control Theory | Perceptual Control Theory (1973) | Behavior as control of perception, homeostasis loops |
| Andrew Ng | AI / Deep Learning | Agentic Reasoning Design Patterns (2024) | Reflection as highest-ROI pattern, tool use as foundational |
| Noah Shinn et al. | LLM Agents | Reflexion (NeurIPS 2023) | Self-reflection after task completion, verbal reinforcement |
| Anthropic | AI Engineering | Building Effective Agents (2024) | Workflows vs. agents taxonomy, agentic loop pattern |
| Ortony, Clore & Collins | Emotion Theory | OCC Model (1988) | Formal framework for event-driven emotional responses |
| Daniel Kahneman | Psychology / Behavioral Economics | Thinking, Fast and Slow (2011) | Dual-process theory (System 1/System 2) |

## Context

KenoBot has a brain (Cognitive System) and a nervous system (signal bus). But what other subsystems should it have? This research cross-references classical cognitive architectures (SOAR, ACT-R, BDI, CLARION, LIDA), modern agent frameworks (LangChain, AutoGPT, CrewAI, Anthropic, Semantic Kernel), and theories of mind (Global Workspace Theory, Society of Mind, Perceptual Control Theory) to identify the universal gaps.

## Current State

| Biological System | KenoBot Module | Status |
|---|---|---|
| **Brain** (cognition) | `src/domain/cognitive/` — Memory (4-tier), Identity, Retrieval, Consolidation | Built |
| **Nervous System** (signaling) | `src/domain/nervous/` — Signal bus, middleware, audit trail, trace correlation | Built |
| **Sensory Organs** (input) | `src/adapters/channels/` — Telegram, HTTP (afferent pathway) | Built |
| **Motor Output** (response) | `src/adapters/channels/` + `MESSAGE_OUT` (efferent pathway) | Built |
| **Sleep** (maintenance) | `src/domain/cognitive/consolidation/sleep-cycle.js` — nightly memory consolidation | Built |
| **Reflexes** (automatic response) | `src/application/typing-indicator.js` — fires without brain processing | Built |
| **Autonomic System** (unconscious) | `src/infrastructure/watchdog.js` + `src/adapters/scheduler/` — health checks, cron tasks | Built |
| **Pain/Nociception** | Health events (`health:degraded`, `health:unhealthy`) | Built |
| **Immune System** (basic) | `BaseChannel._isAllowed()`, rate limiting, `CircuitBreaker` | Partial |

## The Three Universal Gaps

Every cognitive architecture, every modern agent framework, and every theory of mind converges on the same three missing subsystems:

| Gap | Description | Who says so |
|---|---|---|
| **No goals or drives** | Purely reactive — message in, response out. Does not *want* anything. | BDI, SOAR, CLARION, AutoGPT, PCT |
| **No attention filtering** | Everything that matches keywords enters context. No prioritization, no salience competition. | ACT-R, GWT, LIDA, LangChain |
| **No self-evaluation** | Never reviews whether its response was good. Does not learn from errors in real time. | Reflexion, Andrew Ng, SOAR, Society of Mind |

## Proposed Systems

### 1. Metacognition — Prefrontal Monitor

**Location**: `src/domain/cognitive/metacognition/`

The agent monitors and evaluates its own reasoning quality — before sending (online monitoring), after conversations (retrospective reflection), and across time (confidence calibration).

**Submodules**:
- `self-monitor.js` — Track response quality signals (length, confidence, user reaction)
- `reflection-engine.js` — Periodic self-assessment (runs in sleep cycle or post-response)
- `confidence-calibrator.js` — Learn when the bot is wrong vs. right

**Three metacognitive functions**:

1. **Online Monitoring**: After generating a response, before sending, run a check. Does the response address what the user asked? Is it consistent with identity? Is the confidence level appropriate? Can be heuristic (length, hedging language) rather than a second LLM call.

2. **Retrospective Reflection**: During the sleep cycle, review recent conversations. What went well? What went poorly? Generate "lessons learned" stored as procedural memories. Powers the existing (mostly placeholder) consolidation system.

3. **Confidence Calibration**: Track predictions vs. outcomes. When the bot says "I think X" and the user later confirms or denies, update a calibration model.

**Expert sources**:

- **SOAR** calls this "impasse detection" — when the agent cannot proceed, it creates a sub-goal and reasons about *why* it is stuck, rather than simply saying "I don't know." (Laird, Newell & Rosenbloom, 1987)
- **Andrew Ng** identifies Reflection as the #1 highest-ROI agentic pattern. Even self-reflection alone (without a separate critic) dramatically improves output quality. (Agentic Design Patterns, 2024)
- **Reflexion** (Shinn et al., 2023) adds explicit self-reflection after task completion: Actor → Evaluator → Self-Reflection → Reflection Memory → improved Actor.
- **Minsky's Society of Mind** defines "censors" (agents that suppress bad ideas before output) and "suppressors" (agents that suppress bad results after production). A pre-send quality check is a censor. (Minsky, 1986)

**Biological metaphor**: Medial prefrontal cortex (self-referential processing) + anterior cingulate cortex (error/conflict detection) + default mode network (replay during "sleep").

**Implementation cost**: Low for online monitoring (heuristic checks in post-processor pipeline). Medium for retrospective reflection (LLM-powered analysis during sleep cycle). High for confidence calibration (needs outcome tracking infrastructure).

### 2. Thalamic Attention Gate

**Location**: `src/domain/cognitive/attention/`

Before assembling the system prompt, runs a salience competition where each memory candidate competes for inclusion based on relevance, recency, frequency, and current focus.

**Submodules**:
- `attention-gate.js` — Salience competition before context assembly
- `focus-tracker.js` — What the bot is currently focused on (persists across turns)
- `relevance-scorer.js` — Score each memory/context item for inclusion

**How it works**: Each memory candidate gets a relevance score combining: (a) keyword match, (b) recency/activation level, (c) alignment with current focus, (d) emotional salience. Only top-N items pass through the gate. The focus tracker maintains a "what we have been talking about" state that persists across turns and biases retrieval.

**Buffer bottleneck**: Instead of "load all relevant memories," use a fixed-size attention buffer (e.g., 5 facts, 3 episodes, 1 procedure) that forces prioritization. This is the "can only think about so many things at once" constraint.

**Expert sources**:

- **ACT-R** (Anderson, 1993) models memory retrieval with two factors: (a) **base-level activation** — how recently and frequently a memory was accessed (recency-weighted log of access count), and (b) **spreading activation** — context items in working memory boost activation of associated memories. Frequently-discussed topics stay accessible; rarely-accessed facts fade unless contextually activated.
- **Global Workspace Theory** / **LIDA** (Baars, 1988; Franklin, 2006): Consciousness is a broadcasting mechanism. The global workspace is not where processing happens, but where results of processing are made available to all other systems. Multiple specialist processors compete; the winning coalition gets broadcast. "Attention codelets" compete to bring information into the global workspace.
- **LIDA's Attention Codelets**: Classify and prioritize — is this message urgent? Is it a continuation? Does it reference a commitment? Not just routing — it is *selective attention* that determines how much cognitive resource to allocate.

**Biological metaphor**: The thalamus is the sensory relay station that decides what information reaches the cortex. The thalamic reticular nucleus is the gate. The attention system decides what memories reach the LLM.

**Implementation cost**: Medium. Mostly extends the existing `RetrievalEngine` with numeric scoring and a capacity limit. Focus tracker is a new working memory field.

### 3. Limbic Drive System — Motivation and Desires

**Location**: `src/domain/cognitive/motivation/`

Gives the bot internal drives and desires that generate proactive behavior, transforming it from a reactive chatbot into an agent that *wants* things.

**Submodules**:
- `desire-register.js` — Persistent store of wants/goals with priority and expiry
- `intention-manager.js` — Committed plans with progress tracking
- `drive-system.js` — Standing drives (curiosity, connection, helpfulness)

**Three layers of motivation**:

1. **Standing Drives** (from identity/SOUL.md): Curiosity (ask about new topics), connection (check in on the user), helpfulness (complete pending tasks). Always active but vary in intensity based on context.

2. **Desires** (generated from conversation): "User mentioned exam Friday" becomes desire "check in Thursday." "User asked me to research X" becomes desire "continue research on X." Desires have priority, expiry, and trigger conditions.

3. **Intentions** (committed plans): When a desire is actionable, it becomes an intention with a concrete plan. Intentions integrate with the Scheduler for time-based execution or with the context builder for conversation-based execution.

**Expert sources**:

- **BDI Model** (Bratman, 1987; Rao & Georgeff, 1995): The dominant model for practical autonomous agents. Defines Beliefs (world model → your memory), Desires (goals → missing), and Intentions (committed plans → missing). The key insight: the Scheduler handles predefined cron tasks, but desires are internally motivated. The agent generates its own goals: "I noticed the user mentioned they have an exam on Friday. I should check in on Thursday."
- **CLARION's Motivational Subsystem** (Sun, 2002): Defines primary drives (self-preservation) and secondary drives (social approval). Rather than always being perfectly responsive, the agent has drives that influence behavior: a "curiosity" drive that prompts follow-up questions, an "efficiency" drive that favors concise responses under high load.
- **Perceptual Control Theory** (Powers, 1973): Reframes the bot entirely — behavior is not "produce responses." Behavior is **the control of perception**. The agent maintains reference signals (desired states from SOUL.md) and acts to keep perceptions aligned. When perception deviates, error drives action. This is homeostasis.

**The PCT reframe**: Identity (SOUL.md) should be seen not as "who I am" but as **reference signals** — desired states the bot actively works to maintain. If the conversation deviates from those states (user frustrated, relationship cooling, quality dropping), the error between reference and perception generates corrective action.

**Biological metaphor**: Hypothalamus (basic drives) + ventral striatum (wanting/desire) + dorsolateral prefrontal cortex (planning and commitment).

**Implementation cost**: Medium-high. Desire persistence is simple (JSONL or working memory). The hard part is desire generation — either the LLM generates desires as a new tag type (like `<desire>check in about exam</desire>`), or a post-processor infers them.

### 4. Endocrine System — Affective State

**Location**: `src/domain/cognitive/affect/`

Maintains a set of numeric internal state variables that change slowly over time and modulate behavior globally across all other systems. Not simulated emotions — a resource allocation mechanism.

**Submodules**:
- `mood-state.js` — Current emotional valence/arousal (numeric, decays over time)
- `sentiment-detector.js` — Detect user emotional state from message
- `affect-modulator.js` — Adjust system behavior based on mood state

**State dimensions**:
- **Valence** (-1.0 to +1.0): negative <-> positive. Increases when user is happy, decreases on errors or conflict.
- **Arousal** (0.0 to 1.0): calm <-> excited. Increases with novel/surprising input, decays over time.
- **Social Connection** (0.0 to 1.0): distant <-> close. Increases with positive interaction frequency, decays with absence.

**How they modulate the system**:
- **Context assembly**: High arousal = more attention capacity. Low valence = more empathy-related memories surfaced.
- **Response style**: High valence + high arousal = enthusiastic. Low valence + low arousal = gentle/careful.
- **Drive modulation**: Low social connection boosts the "reach out" drive.

**Expert sources**:

- **Minsky's Society of Mind** (1986): "Emotions are not separate from cognition — they are resource allocation strategies." When you are angry, different cognitive agents get priority than when you are calm. When curious, exploration agents dominate over exploitation agents. Internal states should change how the system assembles context and what it pays attention to.
- **CLARION** (Sun, 2002): The Motivational Subsystem has dynamic parameters that change based on context — not just personality traits (static) but drives that modulate in real time.
- **OCC Emotion Model** (Ortony, Clore & Collins, 1988): The Cognitive Structure of Emotions — a formal model of how events, agents, and objects generate emotional responses. Provides a systematic framework for which situations should trigger which internal state changes.

**Biological metaphor**: Cortisol (stress response), dopamine (reward signal), oxytocin (social bonding), serotonin (mood baseline). Hormones are slow-changing chemical signals that modulate how all other systems operate — unlike the nervous system (fast signals), they are background state.

**Implementation cost**: Low-medium. Sentiment detection can start with simple keyword/pattern matching. Mood state is a few numbers persisted in working memory. Modulation is adding mood context to the system prompt and adjusting retrieval parameters.

### 5. Motor System + Agentic Loop

**Location**: `src/motor/`

Gives the bot the ability to take actions in the world beyond talking, and the iterative reasoning loop to use them effectively.

**Submodules**:
- `tool-registry.js` — Registry of available tools with schemas
- `tool-executor.js` — Sandboxed tool execution runtime
- `react-loop.js` — Think -> Act -> Observe -> Repeat cycle

**The current limitation**: `AgentLoop._handleMessage` does exactly ONE LLM call per message. It cannot call a tool and feed the result back, break a complex request into steps, or loop until a task is done.

**Expert sources**:

- **Anthropic "Building Effective Agents"** (December 2024): Defines a taxonomy of Workflows (deterministic) vs. Agents (autonomous). Most use cases should be workflows, not agents. But when you need an agent, the **agentic loop** (tool -> observe -> decide -> repeat) is the core pattern. Also defines: prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer.
- **LangGraph** (LangChain, 2024-2025): Models agents as stateful graphs where nodes are computation steps and edges are control flow. Central innovation: the control flow itself is a first-class data structure, enabling pause/resume, branching, looping, and checkpointing.
- **AutoGPT/BabyAGI** (Nakajima, 2023): Introduced the think -> act -> observe loop (ReAct pattern) and task decomposition with dynamic task queues.
- **Andrew Ng** (2024): Identifies Tool Use as one of four foundational agentic patterns alongside Reflection, Planning, and Multi-Agent Collaboration.
- **All modern frameworks** (CrewAI, AutoGen, Semantic Kernel): Every single one treats tool use as table-stakes for an agent.

**Infrastructure that exists**: `BaseProvider` already defines `supportsTools`, `adaptToolDefinitions`, and `buildToolResultMessages` stubs. The plumbing is sketched but no tools are defined and no execution loop exists.

**Biological metaphor**: Motor cortex (plan movement) + cerebellum (coordination and precision) + proprioception (feedback about action results).

**Implementation cost**: Medium-high. Requires: tool registry, tool execution runtime, agentic loop modification (single-call -> iterative), safety guardrails (max iterations already exists).

### 6. Immune System — Threat Detection

**Location**: `src/immune/`

Comprehensive threat detection beyond basic auth/rate-limiting. Monitors for prompt injection, anomalous patterns, resource exhaustion, and self-consistency.

**Submodules**:
- `input-scanner.js` — Screens incoming messages for threats
- `anomaly-detector.js` — Detects behavioral anomalies (sudden pattern changes)
- `quarantine.js` — Isolates suspicious inputs for review
- `integrity-checker.js` — Verifies memory/identity have not been corrupted

**What it detects**:
- **Prompt injection** — messages attempting to override system prompt or identity
- **Memory poisoning** — attempts to insert false memories via manipulated conversation
- **Identity drift** — periodic check that behavior matches identity specification (compare recent responses against SOUL.md principles)
- **Resource abuse** — patterns suggesting automated abuse (rapid-fire, repeated identical messages)
- **Context overflow attacks** — very long messages designed to push important context out of the window

**Key principle**: Graduated response, not binary. From logging a suspicious pattern -> adding extra scrutiny -> blocking entirely.

**Expert sources**:

- **SOAR's impasse detection** (Laird et al., 1987): When the system cannot proceed normally, it should recognize the failure structurally, not just fail silently. Applied to security: when input looks anomalous, create a sub-process to analyze it rather than processing blindly.
- **General AI safety research**: LLM agents exposed to user input face the attack surface of the conversation content itself. Standard web security (input validation, sanitization) applies but is insufficient — the "payload" is natural language that gets injected into the system prompt.

**Biological metaphor**: Innate immunity (skin barrier = auth/permissions), adaptive immunity (antibodies that learn patterns = anomaly detection), autoimmune monitoring (identity drift = checking the self).

**Implementation cost**: Medium. Input scanning can be pattern-based initially. Integrity checking runs during sleep cycle. Quarantine uses existing approval workflow (`approval:proposed`).

## Additional Systems (Lower Priority)

### Executive Function — Planning and Task Decomposition

**Location**: `src/domain/cognitive/executive/`

Manages explicit goals, decomposes complex requests, tracks multi-turn commitments.

- `goal-manager.js` — Active goal stack per conversation
- `planner.js` — Decompose goals into sub-goals
- `commitment-tracker.js` — Track promises made to user
- `focus.js` — Determine current focus of attention

**Sources**: ACT-R's Goal Module (Anderson, 1993), BDI's Intention structure (Rao & Georgeff, 1995), SOAR's decision cycle (Laird et al., 1987), LangGraph plan-and-execute pattern, Semantic Kernel's Planner.

### Circadian System — Temporal Awareness

**Location**: `src/circadian/`

Gives the agent awareness of time patterns and appropriate behavior modulation.

- `clock.js` — Time context provider (time of day, day of week, timezone)
- `rhythms.js` — Learned temporal patterns (when does user usually chat?)
- `scheduler-bridge.js` — Adaptive consolidation timing based on actual low-activity windows

**Sources**: No direct cognitive architecture analog, but temporal reasoning is critical in all planning systems. PCT's reference signals include temporal expectations.

### Digestive System — Input Processing and Knowledge Ingestion

**Location**: `src/digestive/`

Pre-processes incoming messages into structured, enriched representations. Also handles external knowledge ingestion (RAG).

- `parser.js` — Extract structure (URLs, code blocks, lists, questions)
- `classifier.js` — Message intent classification (question, command, follow-up)
- `enricher.js` — Add metadata (language, sentiment, topic signals)

**Sources**: LIDA's Perceptual Associative Memory (Franklin, 2006), CrewAI's Knowledge Sources, general NLP pipeline patterns.

### Vestibular System — Context Orientation

**Location**: `src/vestibular/`

Maintains the agent's "orientation" — awareness of where it is in conversational, relational, and operational context.

- `context-frame.js` — Current conversation frame (topic, mood, depth)
- `user-model.js` — Active model of the current user
- `session-state.js` — Where we are in the conversation arc

**Sources**: GWT's workspace concept (Baars, 1988), LIDA's current situation model (Franklin, 2006).

## Cross-Cutting Architectural Patterns

Beyond individual systems, the research reveals important patterns that span multiple systems:

### Dual-Process Architecture (System 1 / System 2)

**Source**: CLARION (Sun, 2002), Kahneman's "Thinking, Fast and Slow" (2011)

- **System 1** (fast, reflexive): Handle simple messages without invoking the LLM. Greetings, acknowledgments, simple factual lookups from memory.
- **System 2** (slow, deliberate): The full agent loop with LLM invocation.

Architecturally significant for the 2vCPU/4GB Hetzner VPS: not every message needs an API call. A System 1 reflex arc that handles 30% of messages locally cuts costs and latency dramatically.

### Global Workspace Broadcast

**Source**: GWT (Baars, 1988), LIDA (Franklin, 2006)

Instead of a sequential pipeline (message -> agent -> response), run analysis modules in parallel. The Immune System, Digestive System, Goal Manager, and Circadian System all analyze the incoming message simultaneously. Their collective output forms the "conscious" representation that the agent loop processes.

Maps naturally to the NervousSystem middleware pipeline — run analysis middleware in parallel and merge results into an enriched signal payload.

### Homeostasis Loops

**Source**: PCT (Powers, 1973), all biological systems

Every system should have feedback loops that maintain equilibrium:
- Memory too large? -> Consolidation pruning increases
- Response latency too high? -> Reduce retrieval depth
- Too many errors? -> Circuit breaker opens AND agent adjusts behavior
- Context window nearly full? -> Compress session history more aggressively

Pieces exist (circuit breaker, memory pruning, watchdog), but no unified homeostasis controller coordinates these responses.

## Priority Ranking

Consolidated from all three research tracks, ordered by practical impact and implementation cost:

| # | System | Body Metaphor | Cost | Impact | Rationale |
|---|---|---|---|---|---|
| 1 | **Metacognition** | Prefrontal cortex | Low | High | Highest ROI per Ng. Post-processor that evaluates before sending. |
| 2 | **Attention Gate** | Thalamus | Medium | High | Directly improves context quality. Extends existing RetrievalEngine. |
| 3 | **Motivation/Desires** | Limbic system | Medium | High | Transforms reactive -> proactive. Makes the bot "feel alive." |
| 4 | **Affective State** | Endocrine system | Low | Medium-High | Simple numbers that modulate everything. Low cost, high differentiator. |
| 5 | **Tool Use + Loop** | Motor system | High | High | Table-stakes for all frameworks, but high effort. When actions are needed. |
| 6 | **Immune System** | Immune system | Medium | Medium-High | Critical for production with real users on Telegram. |
| 7 | **Executive Function** | Prefrontal cortex | Medium | Medium | Multi-turn task tracking. Valuable once tools exist. |
| 8 | **Circadian** | Suprachiasmatic nucleus | Low | Medium | Low effort, surprisingly human quality to interactions. |
| 9 | **Digestive** | Digestive system | Medium | Medium | Enables System 1/2 split. Saves money on LLM calls. |
| 10 | **Vestibular** | Vestibular system | Low-Medium | Medium | Enriches working memory with conversation frame. |

## The Complete Body Map

```
THE KENOBOT BODY
================

BRAIN (src/domain/cognitive/)
  Cerebral Cortex ......... LLM (the provider)
  Hippocampus ............. MemorySystem (4-tier)                        [BUILT]
  Prefrontal Cortex ....... Executive/Planning + Metacognition           [PROPOSED]
  Anterior Cingulate ...... Attention Gate (conflict/error detection)    [PROPOSED]
  Thalamus ................ Attention Gate (information relay/filtering) [PROPOSED]
  Amygdala ................ Affect System (emotional salience)           [PROPOSED]
  Basal Ganglia ........... Motivation/Drive System (habit + reward)     [PROPOSED]
  Default Mode Network .... SleepCycle (consolidation + reflection)      [BUILT]

NERVOUS SYSTEM (src/domain/nervous/)
  Spinal Cord ............. NervousSystem (signal bus)                   [BUILT]
  Myelin Sheath ........... Middleware pipeline                          [BUILT]
  Neural Traces ........... Audit trail                                  [BUILT]
  Reflex Arcs ............. TypingIndicator, health events               [BUILT]
  Synapses ................ Event listeners                              [BUILT]

ENDOCRINE SYSTEM (src/domain/cognitive/affect/)
  Cortisol ................ Stress response (error rate, frustration)    [PROPOSED]
  Dopamine ................ Reward signal (positive outcomes)            [PROPOSED]
  Oxytocin ................ Social bonding (interaction frequency)       [PROPOSED]

SENSORY ORGANS (src/adapters/channels/)
  Eyes/Ears ............... TelegramChannel, HTTPChannel (input)         [BUILT]

MOTOR SYSTEM (src/motor/)
  Motor Cortex ............ Tool planning and selection                  [PROPOSED]
  Hands ................... Tool execution                               [PROPOSED]
  Cerebellum .............. Coordination (agentic loop)                  [PROPOSED]
  Proprioception .......... Action feedback                              [PROPOSED]

IMMUNE SYSTEM (src/immune/)
  Innate Immunity ......... Auth/Permissions (BaseChannel)               [BUILT]
  Adaptive Immunity ....... Anomaly detection, pattern learning          [PROPOSED]
  Autoimmune Monitor ...... Identity drift detection                     [PROPOSED]

AUTONOMIC SYSTEM
  Heart (vital signs) ..... Watchdog (health monitoring)                 [BUILT]
  Circadian Rhythm ........ Scheduler (timed behaviors)                  [BUILT]
  Sleep ................... SleepCycle (nightly consolidation)            [BUILT]
  Pain Response ........... CircuitBreaker (fault tolerance)             [BUILT]

SKELETON/STRUCTURE
  Bones ................... src/app.js (composition root)                [BUILT]
  DNA ..................... Identity System (SOUL.md, IDENTITY.md)       [BUILT]
  Muscles ................. Providers (the force that moves things)      [BUILT]
```

## Proposed Signal Types

To support the new subsystems, these signals would flow through the Nervous System:

```javascript
// Attention
export const ATTENTION_FOCUS_CHANGED = 'attention:focus-changed'
export const ATTENTION_OVERLOAD = 'attention:overload'

// Motivation
export const DESIRE_FORMED = 'motivation:desire-formed'
export const DESIRE_EXPIRED = 'motivation:desire-expired'
export const INTENTION_COMMITTED = 'motivation:intention-committed'
export const INTENTION_COMPLETED = 'motivation:intention-completed'

// Affect
export const MOOD_SHIFTED = 'affect:mood-shifted'
export const USER_SENTIMENT_DETECTED = 'affect:user-sentiment'

// Metacognition
export const CONFIDENCE_LOW = 'meta:confidence-low'
export const REFLECTION_GENERATED = 'meta:reflection'
export const IMPASSE_DETECTED = 'meta:impasse'

// Executive
export const PLAN_CREATED = 'executive:plan-created'
export const PLAN_STEP_COMPLETED = 'executive:step-completed'

// Immune
export const THREAT_DETECTED = 'immune:threat-detected'
export const INPUT_QUARANTINED = 'immune:quarantined'
export const IDENTITY_DRIFT = 'immune:identity-drift'
```

## Key Theoretical Insights

| Architecture | Core Insight | One-Sentence Takeaway |
|---|---|---|
| **SOAR** | Impasses create subgoals; goals stack | When the bot gets stuck, it should "think harder" not just give up |
| **ACT-R** | Memory activation governs retrieval; buffers limit capacity | Memories should strengthen with use and decay with neglect |
| **BDI** | Agents have desires that drive proactive behavior | The bot should *want* things, not just respond to things |
| **GWT** | Consciousness is a broadcast mechanism; attention is the gate | Information must compete for inclusion in the bot's "awareness" |
| **Society of Mind** | Emotions are resource allocation, not decoration | Internal state should change how every subsystem operates |
| **PCT** | Behavior is the control of perception via feedback loops | The bot should have reference states it actively works to maintain |
| **CLARION** | Dual process: explicit (rules) + implicit (learned patterns) | Not every message needs the full brain — some can be reflexes |
| **CoALA/Reflexion** | Self-reflection after action improves future performance | The bot should evaluate its own responses and learn from them |

## References

### Cognitive Architectures

- **Laird, J., Newell, A., & Rosenbloom, P.** (1987). *SOAR: An architecture for general intelligence.* Artificial Intelligence, 33(1). See also: soar.eecs.umich.edu
- **Anderson, J.R.** (1993, 2007). *The Architecture of Cognition* and *How Can the Human Mind Occur in the Physical Universe?* Oxford University Press. See also: act-r.psy.cmu.edu
- **Bratman, M.** (1987). *Intention, Plans, and Practical Reason.* Harvard University Press.
- **Rao, A.S. & Georgeff, M.P.** (1995). *BDI Agents: From Theory to Practice.* Proceedings ICMAS-95.
- **Sun, R.** (2002). *Duality of the Mind.* Lawrence Erlbaum Associates.
- **Sun, R.** (2006). *The CLARION cognitive architecture: Extending cognitive modeling to social simulation.* Cognition and Multi-Agent Interaction.
- **Franklin, S.** (2006). *The LIDA architecture: Adding new modes of learning to an intelligent, autonomous, software agent.* Integrated Design and Process Technology.
- **Baars, B.J.** (1988). *A Cognitive Theory of Consciousness.* Cambridge University Press.
- **Minsky, M.** (1986). *The Society of Mind.* Simon & Schuster.
- **Powers, W.T.** (1973). *Behavior: The Control of Perception.* Aldine.

### Emotion and Affect Models

- **Ortony, A., Clore, G.L., & Collins, A.** (1988). *The Cognitive Structure of Emotions.* Cambridge University Press.
- **Kahneman, D.** (2011). *Thinking, Fast and Slow.* Farrar, Straus and Giroux.

### Modern Agent Frameworks

- **Anthropic** (2024). *Building Effective Agents.* anthropic.com/engineering/building-effective-agents
- **Andrew Ng** (2024). *Agentic Reasoning Design Patterns.* DeepLearning.AI talks and newsletter, March-April 2024.
- **Shinn, N. et al.** (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning.* NeurIPS 2023.
- **LangChain / LangGraph** (2024-2025). Graph-based agent orchestration with state management. langchain-ai.github.io/langgraph
- **Nakajima, Y.** (2023). *BabyAGI: Task-driven autonomous agent architecture.* github.com/yoheinakajima/babyagi
- **CrewAI** (2024-2025). Role-based multi-agent collaboration framework. docs.crewai.com
- **Microsoft AutoGen** (2024-2025). Multi-agent conversation framework. microsoft.github.io/autogen
- **Microsoft Semantic Kernel** (2024-2025). Plugin-based AI orchestration. learn.microsoft.com/semantic-kernel

### LLM Agent Architecture Research

- **Sumers, T. et al.** (2023-2024). *Cognitive Architectures for Language Agents (CoALA).* Princeton/Stanford. Systematic mapping of cognitive architecture concepts to LLM-based agent systems.
