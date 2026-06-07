---
status: active-supporting
scope: adr-governance-entry
last-reviewed-checkpoint: docs-5
supersedes: []
superseded-by: []
---

# Architecture Decision Records

## Purpose

An ADR is a focused record for one architecture decision.

It is not a general product-design document and not a running brainstorm.

## Recommended Filename Pattern

- `ADR-001-task-storage-and-subtask-promotion.md`
- `ADR-002-ledger-format.md`
- `ADR-003-markdown-projection-managed-blocks.md`

## Recommended ADR Sections

- Title
- Status
- Context
- Decision Drivers
- Options Considered
- Decision
- Consequences
- Deferred Questions
- Revisit Conditions
- Related Documents

## ADR Statuses

- proposed
- accepted
- superseded
- rejected

## Workflow

- create as `proposed`
- review
- accept before runtime implementation that depends on it
- never silently rewrite an accepted ADR
- supersede with a new ADR when the architecture changes

## Next Planned ADR

- `ADR-001`: top-level task storage and subtask promotion model

Do not create `ADR-001` itself until this Docs-5 structure batch is complete.
