---
status: active-source-of-truth
scope: current-project-state
last-reviewed-checkpoint: adr-001b
supersedes: []
superseded-by: []
---

# Current Project State

## Current Phase

- Documentation Governance Consolidation
- Workflow-0 review-bundle tooling is complete and frozen
- Docs-1 migration plan is complete
- Docs-2 entry-point creation is complete
- Docs-3 file migration and relative-link repair are complete
- Docs-4A global navigation refresh is complete
- Docs-4B-1 DayNest metadata is complete
- Docs-4B-2 MoodNest metadata is complete
- Docs-4B-3A shared-architecture classification review is complete
- Docs-4B-3B shared-architecture metadata is complete
- Docs-4B-3C governance-entry metadata is complete
- Docs-4B-4 INDEX and CURRENT finalization is complete
- Docs-5 archive and ADR structure is complete
- ADR-001 is accepted
- ADR-002 is accepted
- task types, draft boundary, adapter, repository contract bridge, and flat checkbox projection helper are complete
- ADR-002B accepted ADR finalisation is the active docs-only batch
- aggregate `tasks.json` is the selected canonical mutable task-state format
- Markdown remains projection
- future ledger remains separate

## Validated Runtime Checkpoint

- MoodNest runtime behavior remains unchanged
- DayNest currently has only one intentionally narrow runtime entry:
  - manual dev-only `append_daily_log` command
- validated chain:
  - manual command
  - DayNest action preview
  - action executor dispatcher
  - `append_daily_log` executor
  - daily-note target resolver
  - daily-note repository
  - append-only Markdown write
- no Daily Agent runtime yet
- no DayNest settings UI yet
- no DayNest dashboard yet
- no task / expense / timer execution yet
- no task repository implementation yet
- no task executor yet
- no task-writing runtime path yet

## Current Task

- finalise and accept `ADR-002-daynest-task-canonical-persistence-format.md`
- keep this batch docs-only
- do not expand runtime yet

## Next Planned Steps

1. ADR-001 is accepted
2. ADR-002 is accepted
3. `Storage Path 2C` preflight is next
4. repository-semantics review remains required before repository implementation
5. no storage, executor, Agent, UI, or dashboard changes yet

## Do Not Implement Yet

- canonical schema types
- renderer implementation
- JSONL ledger implementation
- storage adapters beyond the validated `append_daily_log` path
- settings persistence
- settings UI
- dashboard
- Agent wiring
- LLM wiring for DayNest
- storage changes
- executor changes
- Agent changes
- UI changes
- dashboard changes

## Boundary Reminder

- MoodNest is the emotional-support assistant
- DayNest is the action and local-first personal-growth ledger
- NestHub is a future coordination shell
- raw MoodNest chats must not silently flow into DayNest
