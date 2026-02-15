# Chat Context

> Lightweight per-chat behavioral adaptation — the bot adapts its tone, style, and focus based on the nature of each chat.

**Date**: 2026-02-15
**Status**: Implemented

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| Endel Tulving | Cognitive psychology | Encoding specificity principle (1973) | Validated context-dependent retrieval — behavior should adapt to encoding context |
| Susan Fiske | Social cognition | Social context modeling (1991) | Confirmed that social context (group type, norms) is the strongest predictor of communication style adaptation |
| Allan Paivio | Cognitive psychology | Dual coding theory (1986) | Validated that a short textual primer is sufficient — no need for separate tone/style parameters |
| John R. Anderson | Cognitive architectures | ACT-R (1993, 2007) | Validated activation-based approach: context cue primes relevant behavioral patterns |
| Anthropic engineering | Agent design | Building Effective Agents (2024) | Validated "simplest pattern that works" — markdown primer over structured schema |
| Kent Beck | Software design | Extreme Programming (1999) | YAGNI principle — start with 3-5 lines of context, add structure only if proven needed |
| Ron Sun | Cognitive architectures | CLARION (2002) | Validated implicit vs explicit knowledge distinction — chat context is explicit behavioral guidance |

## Context

KenoBot already supports multi-chat isolation: session history, episodic memory, and working memory are all scoped per chat. A conversation in chat A doesn't leak into chat B. But there's a gap: **the bot behaves identically in all chats**.

A user in a work group, a family chat, and a 1:1 DM gets the same tone, the same level of formality, and the same communication style. Humans naturally adapt — they're more professional in work chats, more casual with friends, more warm with family. The bot should do the same.

## The Metaphor

Chat context maps to **social context awareness** in human cognition — the prefrontal cortex rapidly activating different behavioral scripts based on environmental cues (classroom vs bar vs office). It's not a separate memory system; it's a persistent environmental cue that primes the right behavioral patterns.

| Human Cognition | KenoBot Component |
|---|---|
| "I'm in a meeting" → formal behavior | `context.md` says "Work group" → technical, concise |
| "I'm with friends" → casual behavior | `context.md` says "Friends" → casual, humor ok |
| Context switch is automatic | Context loaded on every message |

## Design Decisions

### Why plain markdown (not JSON/structured)?

All 7 experts agreed: a 3-5 line markdown description is sufficient. The LLM naturally interprets prose descriptions of context ("Work group, backend team, technical tone") without needing separate `type`, `tone`, `participants` fields. Structured schemas add complexity without proven benefit at this scale.

### Why last-wins (not append)?

Chat context describes the *current* nature of the chat, not its history. If the user says "this is actually a work group" after initially saying "friends group", the old context is irrelevant. This matches the `<working-memory>` pattern — full replace, not accumulate.

### Why no `CONFIG_CHANGED` signal?

Chat context is consumed passively — it's loaded into the system prompt on the *next* message. There's no component that needs immediate notification when context changes. Unlike `<memory>` (which triggers retrieval reindexing) or `<bootstrap-complete/>` (which triggers identity finalization), chat context has no side effects beyond prompt assembly.

### Why not part of EpisodicMemory?

Chat context is a **static description**, not a temporal event. It doesn't have timestamps, it doesn't accumulate over time, and it doesn't need consolidation. Delegating directly to `MemoryStore` (like a simple key-value file) is the right level of abstraction.

## Implementation

### Storage

```
~/.kenobot/data/memory/chats/{sessionId}/context.md
```

Content is raw markdown, typically 3-5 lines:

```markdown
Type: Work group (backend team)
Tone: Technical, concise
Topics: Infrastructure, deployment, debugging
```

### Tag

```
<chat-context>Type: Work group\nTone: Technical</chat-context>
```

- Extracted by `src/application/extractors/chat-context.js`
- Post-processor persists via `memory.setChatContext(sessionId, content)`
- Stripped from user-visible response

### System Prompt Injection

Injected as `### Chat context` section in the Memory block, between "Recent notes" and "Chat-specific memory":

```markdown
## Memory

### Memory tags
[tag instructions table]

### Long-term memory
[MEMORY.md]

### Recent notes
[daily logs]

### Chat context          ← HERE
Type: Work group
Tone: Technical, concise

### Chat-specific memory
[chat MEMORY.md]

### Working memory
[scratchpad]
```

### Token Cost

- ~50-80 tokens per request for a typical 3-5 line context
- At 100 messages/day: ~$0.02/month additional cost
- Negligible compared to memory section (~2000 tokens total)

## Testing

28 new tests across 4 test files:

| File | Tests | Coverage |
|------|-------|----------|
| `test/application/chat-context-extractor.test.js` | 11 | Tag extraction, last-wins, edge cases |
| `test/adapters/storage/memory-store.test.js` | 4 | Storage CRUD, auto-directory creation |
| `test/application/post-processors.test.js` | 6 | Pipeline integration, skip conditions |
| `test/conversations/scenarios/chat-context.test.js` | 7 | End-to-end scenarios |

### Key Conversation Scenarios

1. **Persist** — tag saves to `context.md`
2. **Replace** — second update fully replaces first
3. **Prompt injection** — context appears in next turn's system prompt
4. **Tag stripping** — user never sees `<chat-context>` tags
5. **Multi-chat isolation** — chat A context doesn't leak into chat B
6. **No side effects** — plain response creates no `context.md`
7. **Coexistence** — works alongside `<memory>`, `<working-memory>` tags

## Future Considerations

- **Sleep cycle inference**: The sleep cycle could analyze conversation patterns and propose chat context updates (e.g., detecting that a chat always discusses technical topics)
- **Cross-chat retrieval**: RetrievalEngine could use chat context as a retrieval cue — prioritizing facts tagged with matching topics
- **Context suggestions**: When the bot enters a new chat with no context, it could proactively ask "What kind of chat is this?" after a few messages
