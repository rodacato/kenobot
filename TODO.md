# TODO — KenoBot

> Current version: v0.6.0

**Updated**: 2026-02-16

---

## Current State

| System | Status | Tests |
|--------|--------|-------|
| **Nervous System** | Done | 30+ |
| **Cognitive System** | Done | 205+ |
| **Motor System** | Done | 50+ |
| **Immune System** | Done | 40+ |
| **Channels** | Done | 20+ |
| **Providers** | Done (5 providers + circuit breaker) | 15+ |
| **Consciousness Layer** | Done (2 expert profiles, CLI adapter) | 15+ |
| **Embeddings** | Done (SQLite/JSONL backends, hybrid retrieval) | 25+ |
| **Observability** | Done (response tracking, cost tracking, `/health`, `kenobot stats`) | 10+ |
| **CLI** | Done | — |

**Total: 1287 tests, 106 test files, 4 bounded contexts.**

### What shipped since v0.6.0

| Feature | Description |
|---------|-------------|
| **Consciousness Layer** | Gateway + CLI adapter + 2 expert profiles (`semantic-analyst`, `reliability-engineer`). Integrated into keyword expansion and error classification. Fallback to heuristic on failure. |
| **Embedding Retrieval** | Local SQLite/JSONL backends (no external vector DB). Gemini embedding provider. Hybrid retrieval merges keyword + embedding results via Reciprocal Rank Fusion. Opt-in via `EMBEDDING_ENABLED=true`. |
| **Cerebras API provider** | OpenAI-compatible provider with ~3000 tok/s. Full tool support. Models: `llama-8b`, `llama-120b`, `qwen`. |
| **Observability** | `ResponseTracker` (latency, error rates, p95), `CostTracker` (daily/monthly budgets, per-model pricing), `kenobot stats` CLI command, `/health` endpoint aggregating all subsystem stats. |
| **Per-chat context** | `<chat-context>` tag extraction, persistence, and injection into system prompt for behavioral adaptation per conversation. |
| **Logging improvements** | Debug level, value filtering, smart console formatting. Per-message noise downgraded from info to debug. |

---

## Next Up — Expand Consciousness Integration

The consciousness infrastructure is in place (gateway, adapter, fallback contract). Two of three high-impact integrations are done. The next step is extending coverage to the remaining heuristic-heavy subsystems.

### Expert Profiles Status

```
templates/experts/
├── semantic-analyst.json     ✅ Done (expand_keywords, deduplicate_facts, extract_patterns)
├── reliability-engineer.json ✅ Done (classify_error, extract_lesson)
├── quality-reviewer.json     ⬜ Not yet created
└── strategist.json           ⬜ Not yet created
```

### Consciousness Integrations

#### High Impact — 2 of 3 done

| Opportunity | Status | Expert | File |
|---|---|---|---|
| **Query expansion** | ✅ Done | `semantic-analyst` | `keyword-matcher.js` |
| **Error classification** | ✅ Done | `reliability-engineer` | `error-analyzer.js` |
| **Confidence scoring** | ⬜ Pending | `semantic-analyst` | `confidence-scorer.js` |

#### Medium Impact — Still heuristic-only

These work for English/Spanish but are fragile. Consciousness makes them language-agnostic and context-aware.

| Opportunity | Current approach | Expert needed | File |
|---|---|---|---|
| **Hedging detection** | 9 regex patterns (`/\bmaybe\b/i`, `/\bcreo que\b/i`, etc.) | `quality-reviewer` | `self-monitor.js` |
| **Response quality** | Length ratios, word overlap > 0.6, magic penalties | `quality-reviewer` | `self-monitor.js` |
| **Pattern extraction** | `.includes('error')` + `.includes('solved')` keyword matching | `semantic-analyst` | `consolidator.js` |
| **Memory dedup** | Basic staleness pruning only (no semantic dedup yet) | `semantic-analyst` | `memory-pruner.js` |

> Note: `semantic-analyst` already has `extract_patterns` and `deduplicate_facts` task templates defined but not wired into `consolidator.js` and `memory-pruner.js` yet.

#### Sleep Cycle Only — Low frequency, high leverage

These run once per day. Even an expensive call is pennies at 1x/day. Require the `strategist` and `quality-reviewer` profiles.

| Opportunity | Current approach | Expert needed | File |
|---|---|---|---|
| **Sleep insights** | Hardcoded: `if episodesProcessed > 10 && patternsAdded === 0` | `strategist` | `self-improver.js` |
| **Reflection** | `if factsAdded > 5` → static string | `strategist` | `reflection-engine.js` |
| **Integrity drift** | `.includes(pattern)` on response text, length > 2000 chars | `quality-reviewer` | `integrity-checker.js` |

### Suggested Order

1. **Wire `deduplicate_facts`** into `memory-pruner.js` — task template already exists in `semantic-analyst.json`, just needs the `Enhanced` method + fallback pattern
2. **Wire `extract_patterns`** into `consolidator.js` — same pattern, task template ready
3. **Create `quality-reviewer.json`** profile — enables hedging detection, response quality, integrity drift
4. **Wire quality-reviewer** into `self-monitor.js` — replace regex patterns with LLM evaluation
5. **Create `strategist.json`** profile — enables sleep insights and reflection
6. **Wire strategist** into sleep cycle — `self-improver.js` and `reflection-engine.js`
7. **Confidence scoring** — add `evaluate_confidence` task to `semantic-analyst`, wire into `confidence-scorer.js`

---

## Backlog — Not Ready Yet

Items that add value but need more design or whose complexity isn't justified today.

| Item | Status |
|------|--------|
| **Attention Gate** | Useful once memory exceeds ~500 facts. Embedding retrieval + consciousness confidence scoring partially solve this — revisit after confidence scoring is wired. |
| **RAG for code context** | Embedding infrastructure is now available. Revisit when Motor System handles repos >10k LOC. |
| **Motivation/Desires** | Adds personality, not capability. Scheduler already covers proactive behavior. |
| **Affective State** | Identity rules handle tone. Emotional nuance is a polish item, not a gap. |
| **Input scanner** | Consciousness layer's integrity checking replaces this more naturally. Wait for `quality-reviewer` profile. |
| **API consciousness adapter** | CLI adapter works but adds latency (~2-5s per call). An API adapter (Gemini API, Cerebras API) would be faster. Not urgent — current latency is acceptable for background/async calls. |
