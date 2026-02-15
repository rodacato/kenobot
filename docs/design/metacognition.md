# Metacognition

> The self-monitoring capacity of KenoBot — the ability to evaluate, reflect on, and improve its own responses.

**Date**: 2026-02-14
**Status**: Designed

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| John Laird, Allen Newell | Cognitive architectures | SOAR (1987) | Validated impasse detection and learning-from-failure pattern |
| John R. Anderson | Cognitive architectures | ACT-R (1993, 2007) | Validated activation-based confidence from retrieval scores |
| Ron Sun | Cognitive architectures | CLARION (2002, 2006) | Validated dual monitoring/control metacognitive model |
| Andrew Ng | Agentic AI patterns | Agentic Reasoning Design Patterns (2024) | Validated heuristic-first approach; reflection as highest-ROI pattern |
| Noah Shinn et al. | AI agents | Reflexion (NeurIPS 2023) | Validated verbal reinforcement learning loop |
| Anthropic engineering | Agent design | Building Effective Agents (2024) | Validated "simplest pattern that works" philosophy |
| John H. Flavell | Psychology | Metacognition framework (1979) | Validated "feeling of knowing" as confidence estimation |
| Thomas Nelson, Louis Narens | Psychology | Metamemory framework (1990) | Validated monitoring/control two-level model |

## Context

KenoBot has a brain (Cognitive System) and a nervous system (signal bus). The brain processes messages and generates responses. The nervous system routes signals and keeps an audit trail. But nobody checks if the brain's output is actually *good*.

When the agent generates a response, it goes straight to the user. There is no quality gate. No confidence estimation. No "wait, did I actually answer what they asked?" moment. The post-processor pipeline extracts memories and tags, but never evaluates the response itself.

Every cognitive architecture (SOAR, ACT-R, CLARION) includes metacognition as a core subsystem. Andrew Ng identifies Reflection as the highest-ROI agentic design pattern. The research is unanimous: agents that evaluate their own output perform significantly better than those that do not.

The brain needs to think about its own thinking.

## The Metaphor

Metacognition maps to the brain's self-monitoring circuits — the prefrontal cortex evaluating its own reasoning, the anterior cingulate detecting errors, and the default mode network replaying experiences during rest.

| Brain Region | KenoBot Component | Status |
|---|---|---|
| **Medial prefrontal cortex** (self-reference) | Self-monitor — "how am I doing?" | Missing |
| **Anterior cingulate cortex** (error detection) | Confidence estimator — "am I sure about this?" | Missing |
| **Orbitofrontal cortex** (impulse control) | Pre-send gate — "should I say this?" | Missing |
| **Default mode network** (rest-state replay) | Sleep-cycle reflection — "what went well/poorly?" | Partial (consolidation exists) |
| **Hippocampus** (experience encoding) | Reflection memory — store lessons learned | Partial (episodic memory exists) |

### How It Fits in the Body

```
                    ┌──────────────────────────────────────┐
                    │            Brain                      │
                    │                                       │
                    │  ┌─────────────────────────────────┐ │
                    │  │   Metacognition (NEW)            │ │
                    │  │   ┌───────────────────────┐     │ │
                    │  │   │ Self-Monitor           │     │ │
                    │  │   │ "Did I answer well?"   │     │ │
                    │  │   └───────────┬───────────┘     │ │
                    │  │               │ evaluates        │ │
                    │  │   ┌───────────▼───────────┐     │ │
                    │  │   │ Confidence Gate        │     │ │
                    │  │   │ "Am I sure enough?"    │──┐  │ │
                    │  │   └───────────────────────┘  │  │ │
                    │  │                               │  │ │
                    │  │   ┌───────────────────────┐  │  │ │
                    │  │   │ Reflection Engine      │  │  │ │
                    │  │   │ (sleep cycle)          │  │  │ │
                    │  │   │ "What did I learn?"    │  │  │ │
                    │  │   └───────────────────────┘  │  │ │
                    │  └──────────────────────────────┘  │ │
                    │                                     │ │
                    │  ┌─────────────────────┐           │ │
                    │  │  Cognitive System    │           │ │
                    │  │  (memory, identity,  │           │ │
                    │  │   retrieval)         │           │ │
                    │  └─────────────────────┘           │ │
                    │                                     │ │
                    └─────────────────────────────────────┘ │
                                    │                       │
                    ┌───────────────▼───────────────────────▼─┐
                    │          Nervous System                   │
                    │   fire('message:out') or inhibit          │
                    └──────────────────────────────────────────┘
```

**What does NOT change:** The Cognitive System's consolidation/sleep-cycle already does offline review. Metacognition does not replace it — it adds an *online* (real-time) self-monitoring layer that feeds into the existing offline consolidation. The post-processor pipeline stays — metacognition adds a new post-processor, not a new pipeline.

## What We're Building

A metacognition module inside `src/domain/cognitive/` — same bounded context as memory and identity, because metacognition is a cognitive function, not infrastructure.

```
src/domain/cognitive/metacognition/
  index.js              — MetacognitionSystem facade
  self-monitor.js       — Online response evaluation (pre-send quality gate)
  confidence.js         — Confidence estimation for responses
  reflection.js         — Retrospective analysis (integrates with sleep cycle)
```

### Self-Monitor

Evaluates the response *before* it is sent. Runs as the last post-processor in the agent pipeline.

**What it checks (heuristic, no LLM call):**
- **Responsiveness**: Does the response address the user's message? (keyword overlap, question detection)
- **Completeness**: If the user asked multiple questions, were all addressed? (question count vs. response structure)
- **Identity consistency**: Does the tone/language match identity parameters? (language match, forbidden patterns)
- **Length sanity**: Is the response suspiciously short (< 10 chars) or excessively long?
- **Repetition detection**: Is this response nearly identical to a recent one? (similarity with last N responses in session)

**What it produces:**
```javascript
{
  score: 0.85,              // 0.0–1.0 composite quality score
  flags: [],                // issues found, empty = clean
  passed: true,             // above threshold → send
  evaluation: {
    responsiveness: 0.9,
    completeness: 1.0,
    consistency: 0.8,
    lengthOk: true,
    repetition: false
  }
}
```

**When the score is below threshold:**
- Low confidence (0.5–0.7): Add a hedging prefix ("I'm not entirely sure, but...") via identity-aware templating
- Very low confidence (< 0.5): Log a `meta:confidence-low` signal for the audit trail. Still send (never block responses), but flag for retrospective review.

**Design decision**: The self-monitor is heuristic-only — no second LLM call. This keeps latency at zero and cost at zero. The heuristics catch obvious failures (empty responses, wrong language, missed questions) while letting the LLM's own quality handle nuance.

### Confidence Estimation

Estimates how confident the agent should be, based on retrievable signals (not the response content itself).

**Inputs:**
- **Retrieval scores**: Did the retrieval engine find relevant memories? High confidence = high response confidence.
- **Topic familiarity**: Has this topic appeared in semantic memory? How many times?
- **Session context**: Is this a continuation (high context) or a cold start (low context)?
- **Identity coverage**: Does the identity system have guidance for this type of request?

**Output:** A confidence level (high / medium / low) injected into the system prompt: "Your confidence level for this response is: medium. You have limited memory about this topic."

This lets the LLM itself calibrate its certainty language based on how much the system actually knows.

### Reflection Engine

Retrospective analysis during the sleep cycle (integrates with existing `src/domain/cognitive/consolidation/`).

**What it does:**
1. Reviews conversations from the past cycle
2. Identifies patterns: frequently asked topics, repeated user corrections, knowledge gaps
3. Generates "lessons learned" stored as procedural memories
4. Detects quality trends: is response quality improving or degrading over time?

**Integration with existing consolidation:**
- The `SleepCycle` already runs `Consolidator` for memory pruning and `ErrorAnalyzer` for error patterns
- Reflection adds a third consolidation phase: self-assessment
- Results feed into procedural memory as actionable patterns: "When user asks about X, remember to also mention Y"

## What Changes for Existing Code

| Area | Change |
|---|---|
| **Post-processor pipeline** (`application/post-processors.js`) | Add `evaluateResponse` as the last post-processor |
| **Context builder** (`application/context.js`) | Inject confidence level into system prompt when available |
| **Cognitive System** (`domain/cognitive/index.js`) | Expose `metacognition` subsystem alongside memory, identity, retrieval |
| **Sleep cycle** (`domain/cognitive/consolidation/sleep-cycle.js`) | Add reflection phase after existing consolidation |
| **Signals** (`infrastructure/events.js`) | Add `meta:confidence-low`, `meta:reflection`, `meta:impasse` |
| **Consumers** | No changes — metacognition is internal to the brain |

## What We Gain

1. **Quality gate**: Obvious failures (empty responses, wrong language, missed questions) caught before reaching the user
2. **Calibrated confidence**: The LLM knows when it is operating with limited context and can hedge appropriately
3. **Learning loop**: The sleep cycle produces actionable lessons that improve future responses
4. **Observability**: `meta:confidence-low` signals in the audit trail reveal when and why the bot is uncertain
5. **Foundation**: Self-monitoring is prerequisite for Attention and Motivation systems — they need "how am I doing" to adjust behavior

## What We Explicitly Don't Build

- **Second LLM call for evaluation**: Too expensive, too slow. Heuristics first. LLM evaluation is a future extension.
- **Response blocking**: The self-monitor flags but never blocks. A bad response is better than no response.
- **User satisfaction tracking**: Requires explicit feedback mechanisms. Out of scope — belongs in a future feedback system.
- **Emotional state modeling**: That is the Endocrine System, not metacognition. Metacognition monitors *cognitive quality*, not *emotional state*.

## References

### Cognitive Architectures

**SOAR — Impasse Detection and Meta-Reasoning**
- Authors: John Laird, Allen Newell, Paul Rosenbloom
- Work: *SOAR: An architecture for general intelligence* (1987), University of Michigan
- Key contribution: When the decision cycle cannot proceed, SOAR creates a sub-goal and reasons about *why* it is stuck. This is structural metacognition: the system recognizes its own cognitive failure.
- Our implementation: Self-monitor detects when response quality is below threshold → logs `meta:impasse` → reflection engine generates procedural memories from failure patterns (chunking).

**ACT-R — Activation-Based Confidence**
- Author: John R. Anderson
- Work: *The Architecture of Cognition* (1993), *How Can the Human Mind Occur in the Physical Universe?* (2007)
- Key contribution: Each memory chunk has an activation level reflecting recency and frequency. High-activation retrieval = high confidence. Low-activation or no results = low confidence.
- Our implementation: Confidence estimator uses retrieval scores as primary input — computationally free since the retrieval engine already produces confidence scores.

**CLARION — Metacognitive Subsystem**
- Author: Ron Sun
- Work: *Duality of the Mind* (2002), *The CLARION cognitive architecture* (2006)
- Key contribution: Explicitly defines a Metacognitive Subsystem (MCS) with two functions: Monitoring (observing other subsystems) and Control (adjusting parameters).
- Our implementation: Self-monitor is the monitoring path; confidence injection into system prompt is the control path.

### Agentic Design Patterns

**Andrew Ng — Reflection as Highest-ROI Pattern**
- Work: *Agentic Reasoning Design Patterns* (DeepLearning.AI, March–April 2024)
- Key claim: Even simple self-reflection significantly improves quality. Start with the simplest form.
- Our implementation: Heuristic self-monitoring first (no LLM call). Architecture supports upgrading to LLM-based reflection later.

**Reflexion — Verbal Reinforcement Learning**
- Authors: Noah Shinn, Federico Cassano, et al.
- Work: *Reflexion: Language Agents with Verbal Reinforcement Learning* (NeurIPS 2023)
- Key contribution: Three-component architecture (Actor → Evaluator → Self-Reflection) with verbal feedback stored in reflection memory.
- Our implementation: AgentLoop (actor) → Self-monitor (evaluator) → Reflection engine (self-reflection) → Procedural memory (reflection memory) → Context builder (prompt injection). The loop is complete.

**Anthropic — Building Effective Agents**
- Work: *Building Effective Agents* (anthropic.com/engineering, December 2024)
- Key recommendation: Use the simplest pattern that works. Gate checks between processing steps catch failures before they propagate.
- Our implementation: Self-monitor as an output guardrail following the "simplest pattern" philosophy.

### Metacognition in Psychology

**Flavell — Metacognition Framework**
- Author: John H. Flavell
- Work: *Metacognition and cognitive monitoring* (American Psychologist, 1979)
- Key contribution: Divided metacognition into Knowledge (what I know about my cognition), Regulation (controlling my cognition), and Experiences (feelings accompanying cognition — "feeling of knowing").
- Our implementation: Confidence calibration implements the "feeling of knowing" — a rapid assessment of whether relevant information exists before generating a response.

**Nelson & Narens — Monitoring and Control**
- Authors: Thomas O. Nelson, Louis Narens
- Work: *Metamemory: A theoretical framework and new findings* (1990)
- Key contribution: Two-level system — Object level (cognitive process) and Meta level (monitoring + control). Monitoring flows upward (observing), control flows downward (adjusting).
- Our implementation: Self-monitor reads quality upward; confidence injection modulates LLM behavior downward. Both directions are required — monitoring without control is useless, control without monitoring is blind.

### Software Engineering Patterns

- **Chain of Responsibility** (GoF, 1994): Self-monitor as last handler in post-processor chain
- **Quality Gate** (Humble & Farley, *Continuous Delivery*, 2010): Automated check before response delivery — flag but don't block
- **Observer Pattern** (GoF, 1994): Metacognitive signals (`meta:confidence-low`, `meta:impasse`) on the nervous system bus

### Design Decision Validation

| Decision | Validated By |
|---|---|
| Heuristic-first, no LLM call | Ng (start simple), Anthropic (simplest pattern) |
| Confidence from retrieval scores | ACT-R (activation-based confidence), Flavell (feeling of knowing) |
| Monitoring + control dual function | CLARION (MCS), Nelson & Narens (object/meta levels) |
| Self-monitor as last post-processor | Chain of Responsibility (GoF), Quality Gate (CD) |
| Reflection via sleep cycle | Reflexion (verbal reinforcement), SOAR (chunking from impasses) |
| Flag but don't block responses | Quality Gate (non-blocking in development) |
| Lessons stored as procedural memories | Reflexion (reflection memory), SOAR (chunking) |
| Confidence injected into system prompt | CLARION (control path), Nelson & Narens (meta → object) |
| Metacognitive signals on the bus | Observer (GoF), nervous system architecture |
