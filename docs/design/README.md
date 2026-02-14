# Design & Research

> The **why** behind KenoBot's architecture — research, rationale, expert validation, and design decisions.

This directory contains the design knowledge that shaped KenoBot. While `docs/features/` explains **what** each system does, `docs/design/` explains **why** it exists and what thinking led to its design.

## Who This Is For

- **Contributors** who want to understand the reasoning behind architectural decisions
- **Forkers** who want to evaluate which design choices apply to their own project
- **The maintainer** who needs to revisit past research when planning new systems

## Conventions

### Document Template

Every research document follows this structure:

```markdown
# [Topic Name]

> One-line description

**Date**: YYYY-MM-DD
**Status**: Research | Designed | Implemented | Archived

## Experts Consulted

| Expert | Field | Key Work | Role in This Research |
|--------|-------|----------|----------------------|
| Name   | ...   | ...      | What they validated   |

## Context

[Why this research exists — self-contained, no links to other design docs]

## [Topic-specific sections...]

## References

[Literature, patterns, citations — inline, not in a separate file]
```

### Rules

1. **Self-contained** — Each document has everything needed to understand it. No cross-links between design documents.
2. **Experts preserved** — Every document lists the expert personas consulted, with enough detail to re-invoke them. New experts are also added to [experts.md](experts.md).
3. **Independently deletable** — Removing any single document breaks nothing else.
4. **English only** — All content in English, following the project convention.

### Adding New Research

1. Create a new file from the template above
2. Add the entry to the Research Diary below
3. Catalog any new expert personas in [experts.md](experts.md)

---

## Research Diary

| # | Date | Topic | Status | File |
|---|------|-------|--------|------|
| 1 | 2026-02-13 | Cognitive Architecture | Implemented | [cognitive-architecture.md](cognitive-architecture.md) |
| 2 | 2026-02-14 | Nervous System | Implemented | [nervous-system.md](nervous-system.md) |
| 3 | 2026-02-14 | Metacognition | Designed | [metacognition.md](metacognition.md) |
| 4 | 2026-02-14 | Body Systems Survey | Research | [body-systems.md](body-systems.md) |
| 5 | 2026-02-14 | Implementation Plan | Planning | [implementation-plan.md](implementation-plan.md) |
| 6 | 2026-02-14 | Developer Experience | Designed | [developer-experience.md](developer-experience.md) |
| 7 | 2026-02-14 | Documentation Taxonomy | Implemented | [documentation.md](documentation.md) |
