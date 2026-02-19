# TODO — KenoBot

> Current version: v0.6.0

**Updated**: 2026-02-19

---

## Current State

| System | Status | Tests |
|--------|--------|-------|
| **Nervous System** | Done | 30+ |
| **Cognitive System** | Done | 205+ |
| **Motor System** | Done | 50+ |
| **Immune System** | Done | 40+ |
| **Channels** | Done | 20+ |
| **Providers** | Done (7 providers + circuit breaker) | 170+ |
| **Consciousness Layer** | Done (4 expert profiles, CLI + API adapters) | 15+ |
| **Embeddings** | Done (SQLite/JSONL backends, hybrid retrieval) | 25+ |
| **Observability** | Done (response tracking, cost tracking, `/health`, `kenobot stats`) | 10+ |
| **CLI** | Done | — |

**Total: 1300+ tests, 107 test files, 4 bounded contexts.**

### What shipped since v0.6.0

| Feature | Description |
|---------|-------------|
| **Consciousness Layer** | Gateway + CLI adapter + API adapter (Gemini) + 4 expert profiles (`semantic-analyst`, `reliability-engineer`, `quality-reviewer`, `strategist`). Integrated into keyword expansion, error classification, consolidation, and metacognition. Fallback to heuristic on failure. |
| **Consciousness wiring** | `deduplicate_facts` → `memory-pruner.js`, `extract_patterns` → `consolidator.js`, `evaluate_response` → `self-monitor.js`, `analyze_sleep_results` → `self-improver.js`, `generate_reflection` → `reflection-engine.js`. All with Enhanced methods + heuristic fallback. |
| **Embedding Retrieval** | Local SQLite/JSONL backends (no external vector DB). Gemini embedding provider. Hybrid retrieval merges keyword + embedding results via Reciprocal Rank Fusion. Opt-in via `EMBEDDING_ENABLED=true`. |
| **Cerebras API provider** | OpenAI-compatible provider with ~3000 tok/s. Full tool support. Models: `llama-8b`, `llama-120b`, `qwen`. |
| **Codex CLI provider** | Wraps OpenAI Codex CLI (`codex exec`). JSONL output with usage tracking. Models: `gpt-5.3-codex`, `o3`, `o4-mini`. |
| **Observability** | `ResponseTracker` (latency, error rates, p95), `CostTracker` (daily/monthly budgets, per-model pricing), `kenobot stats` CLI command, `/health` endpoint aggregating all subsystem stats. |
| **Per-chat context** | `<chat-context>` tag extraction, persistence, and injection into system prompt for behavioral adaptation per conversation. |
| **Logging improvements** | Debug level, value filtering, smart console formatting. Per-message noise downgraded from info to debug. |

---

## Next Up — Finish Consciousness Wiring

Most consciousness integrations are done. One gap remains before this phase is complete.

### Expert Profiles Status

```
templates/experts/
├── semantic-analyst.json     ✅ Done (expand_keywords, deduplicate_facts, extract_patterns, evaluate_confidence)
├── reliability-engineer.json ✅ Done (classify_error, extract_lesson)
├── quality-reviewer.json     ✅ Done (evaluate_response, detect_hedging)
└── strategist.json           ✅ Done (analyze_sleep_results, generate_reflection)
```

### Remaining Gaps

| # | Gap | Description | File |
|---|-----|-------------|------|
| 1 | **Wire `estimateConfidenceEnhanced`** | `evaluate_confidence` template exists in `semantic-analyst.json` but `ConfidenceEstimator` has no consciousness and no enhanced method | `confidence-estimator.js` |

---

## Backlog — Not Ready Yet

Items that add value but need more design or whose complexity isn't justified today.

| Item | Status |
|------|--------|
| **Attention Gate** | Useful once memory exceeds ~500 facts. Embedding retrieval + consciousness confidence scoring partially solve this — revisit after confidence scoring is wired. |
| **RAG for code context** | Embedding infrastructure is now available. Revisit when Motor System handles repos >10k LOC. |
| **Motivation/Desires** | Adds personality, not capability. Scheduler already covers proactive behavior. |
| **Affective State** | Identity rules handle tone. Emotional nuance is a polish item, not a gap. |
| **Input scanner** | Consciousness layer's integrity checking replaces this more naturally. `quality-reviewer` profile is ready. |
| ~~API consciousness adapter~~ | ✅ Done — Gemini API adapter shipped. |
