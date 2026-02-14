# Documentation Taxonomy

> How KenoBot organizes its documentation — the system behind the system.

**Date**: 2026-02-14
**Status**: Implemented

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| Daniele Procida | Documentation architecture | Diataxis framework (diataxis.fr) | Identified missing "Explanation" layer; recommended separating docs by purpose |
| Michael Nygard | Production architecture | "Release It!", Architecture Decision Records | Diagnosed research docs as deeper than ADRs; recommended per-system design folders |

## Context

KenoBot accumulates design knowledge through a research-first process: expert consultation, literature review, metaphor mapping, multi-round validation, then implementation. This knowledge was stored in `.tmp/` — a name that implies "disposable" for content that is permanently valuable.

The project is public. Contributors need two things:
1. **Feature documentation** — What does each system do? How do I use/extend it?
2. **Design rationale** — Why does this system exist? What alternatives were considered? What experts validated it?

Only the first existed in `docs/`. The second was scattered across `.tmp/` with no organization, no conventions, and no discoverability.

## Analysis

### Diataxis Framework (Procida)

The Diataxis framework classifies documentation into four types based on two axes: *what the user is doing* (learning vs. working) and *what they need* (practical steps vs. theoretical understanding).

| Type | Purpose | Orientation | KenoBot Equivalent |
|------|---------|-------------|-------------------|
| **Tutorials** | Learning by doing | Learning + practical | `docs/quickstart/` |
| **How-to guides** | Solving specific problems | Working + practical | `docs/guides/` |
| **Reference** | Looking up facts | Working + theoretical | `docs/reference/`, `docs/features/` |
| **Explanation** | Understanding context | Learning + theoretical | **Was missing** — lived in `.tmp/` |

**Diagnosis**: The research documents (nervous system design, cognitive architecture, metacognition) are *Explanation* documentation — they answer "why does this exist?" and "what thinking led to this design?" This is a legitimate and important documentation category, not throwaway notes.

**Recommendation**: Add an Explanation layer to `docs/`. Don't mix it with Reference — they serve different needs. A contributor reading `docs/features/nervous-system/` learns *what* the nervous system does. A contributor reading the design doc learns *why* it exists.

### Architecture Decision Records (Nygard)

ADRs are lightweight records of significant architectural decisions. But KenoBot's research goes deeper — it includes:
- Literature reviews with academic citations
- Expert consultation with multiple personas
- Multi-round validation processes (4 rounds for cognitive architecture)
- Biological metaphor mappings validated against neuroscience

These are closer to **Design Documents** (Google's internal approach) or **RFCs** (Rust's approach) than simple ADRs.

**Recommendation**: Use a `docs/design/` directory mirroring `docs/features/`. Each system gets its own design document. Cross-cutting documents (roadmap, prior art) coexist at the same level. A README provides the organizational guide and chronological diary.

## Decision

### Structure

```
docs/
  features/           ← WHAT: polished feature specifications
    cognitive-system/
    nervous-system/
  design/             ← WHY: research, rationale, references
    README.md          ← Organizational guide + research diary
    experts.md         ← Master catalog of expert personas
    [topic].md         ← One self-contained file per research topic
```

### Principles

1. **features/ and design/ are parallel** — Same system names, different purpose. Feature docs tell you what it does. Design docs tell you why.

2. **Self-contained documents** — Each design doc has everything needed to understand it: context, expert list, analysis, references. No cross-links between design documents, so any can be deleted independently.

3. **Expert preservation** — Every document catalogs the expert personas used, with enough detail to re-invoke them in future sessions. A master catalog (`experts.md`) aggregates all experts across all research.

4. **Research diary** — The README maintains a chronological log of all research topics with dates, status, and file links. This serves as the "table of contents" and makes the research history visible.

5. **English only** — All design documents in English, following the project-wide convention.

## What This Gives Contributors

| Need | Where to look |
|------|--------------|
| "I want to use or extend the bot" | `docs/features/` |
| "I want to understand why it works this way" | `docs/design/` |
| "I want to see the project roadmap" | `docs/design/implementation-plan.md` |
| "I want to see what other projects influenced this" | `docs/design/cognitive-architecture.md` (prior art section) |
| "I want to re-use an expert persona" | `docs/design/experts.md` |

## References

- Procida, D. *Diataxis: A systematic approach to technical documentation authoring.* diataxis.fr
- Nygard, M. *Documenting Architecture Decisions.* cognitect.com/blog, November 2011
- Nygard, M. *Release It! Design and Deploy Production-Ready Software.* Pragmatic Bookshelf, 2007 (2nd ed. 2018)
- Google Engineering. *Design Documents.* Internal practice described in *Software Engineering at Google* (O'Reilly, 2020)
- Rust RFC Process. *Rust RFCs.* github.com/rust-lang/rfcs
