---
status: accepted
scope: daynest-task-architecture-decision
last-reviewed-checkpoint: adr-001b
supersedes: []
superseded-by: []
---

# ADR-001: Top-Level Task Storage And Subtask Promotion

## Status

accepted

## Context

DayNest needs a task architecture that supports:

- simple one-off tasks
- long-running tasks with deadlines
- parent tasks and subtasks
- subtasks that may themselves become complex
- Agent-assisted task breakdown later
- timers linked to tasks later
- local-first storage
- audit-friendly growth and reward tracking later
- Markdown projections for Obsidian readability

Representative example:

- Group assignment
  - discuss topic
  - collect references
  - prepare slides
    - create structure
    - find images
    - format slides
  - write script
  - present

This architecture must stay conservative for MVP work while preserving a clean path toward later task decomposition, timers, ledgers, analytics, and readable Markdown projections.

## Decision Drivers

- minimal MVP complexity
- future Agent-assisted decomposition
- stable task identity across reparenting
- compatibility with future ledgers and timers
- readable Markdown projection
- local-first storage
- auditability
- ability to add analytics later
- avoiding premature Project/Subtask class hierarchies
- preventing silent destructive changes

## Options Considered

### Option 1: Separate Project, Task, and Subtask entity types

Pros:

- explicit semantic separation
- project-specific fields can be isolated early

Cons:

- higher MVP complexity
- awkward type conversion when a subtask becomes larger work
- more brittle Agent output contracts later
- encourages premature hierarchy design before actual usage patterns are proven

### Option 2: Nested canonical task objects with embedded children

Pros:

- tree shape is directly visible in canonical storage
- simple to render as a nested projection

Cons:

- reparenting becomes more complex
- stable identity is harder to preserve across moves
- updates to one child can force broader parent rewrites
- later timers, ledgers, and analytics must work around embedded record boundaries

### Option 3: Unified flat `TaskRecord` model with optional `parentTaskId`

Pros:

- all tasks use one canonical record shape
- root tasks simply have no `parentTaskId`
- child tasks use `parentTaskId`
- children are derived by querying relationships
- nested trees become projections rather than canonical embedded objects
- stable ids survive promotion and reparenting cleanly

Cons:

- relationship queries are required to reconstruct trees
- cycle prevention and projection rules must be explicit

### Recommendation

Recommend Option 3.

Use one unified flat task record model with optional `parentTaskId` relationships.

## Decision

### 1. Unified task entity

Use one canonical task record type for root tasks and nested tasks.

Do not create separate Project, Task, and Subtask canonical types during MVP.

### 2. Flat canonical relationship model

Each task record has:

- `id`
- `title`
- `status`
- optional `parentTaskId`
- optional `dueDate`
- optional `scheduledDate`
- `createdAt`
- `updatedAt`

This ADR does not define the complete final TypeScript interface.
It defines the architecture boundary, not the implementation code.

Canonical task relationships must preserve deterministic sibling ordering.
Re-rendering a task tree must not arbitrarily reorder siblings.
Reparenting and manual reordering must preserve stable task ids.
The exact representation, such as `sortOrder`, `rank`, or `positionKey`, is deferred to Task Schema 1A.

### 3. Root task definition

A root task is any task without `parentTaskId`.

### 4. Nested task definition

A nested task is any task with `parentTaskId`.

### 5. Subtask promotion and reparenting

Promoting a subtask is not a type conversion.
It is a relationship update:

- remove `parentTaskId` to make it a root task
- or change `parentTaskId` to move it under another task

Preserve:

- task id
- history
- linked timers
- future ledger references
- `createdAt`
- audit trail

### 6. Tree invariants

Require:

- task ids are unique
- `parentTaskId` must not equal the task id
- `parentTaskId` should reference an existing task when persisted
- parent relationships must remain acyclic
- sibling ordering must remain deterministic
- reparenting must not silently lose historical links
- projections must derive the tree from canonical flat records

### 7. Nesting depth

Canonical storage should not hard-code a small maximum nesting depth.

MVP UI, Agent actions, and Markdown projections may apply conservative depth limits for usability.
Deep nesting is not a runtime priority in MVP.

### 8. No separate Project entity in MVP

A long-running task is represented as a root task with:

- optional `dueDate`
- optional `scheduledDate`
- optional child tasks

A future Project entity may be introduced only if later requirements justify it.

### 9. Parent completion rule

Do not automatically mark a parent task complete when all child tasks are complete.

Instead:

- calculate the derived state
- show a suggestion that the parent may be ready to complete
- require an explicit user-confirmed action to complete the parent

If a user attempts to complete a parent task while active child tasks remain:

- do not silently cascade changes
- require explicit confirmation
- defer exact confirmation UX to later implementation design

### 10. Progress rule

Progress is derived, not stored as canonical mutable state.

For MVP planning, recommend:

- parent progress is derived from non-cancelled leaf descendants
- completed and incomplete non-cancelled leaves both participate in the denominator
- cancelled leaves are excluded
- if a task has no descendants, its progress follows its own status
- future weighted progress may be introduced later if estimated effort is added

The exact helper implementation belongs to a later pure-helper batch.

Future effort estimates may later distinguish a task's own effort from aggregated descendant effort.
Progress percentage, reward-token balance, and growth balance must not be conflated.
Weighted progress and milestone reward rules remain deferred.

### 11. View placement rule

Recommend separating:

- Today Tasks
  - actionable leaf tasks scheduled today, due today, or overdue
- Ongoing Projects
  - active root tasks with children or longer-running scope
- Upcoming Deadlines
  - tasks with future due dates within a configurable window

An active long-running root task remains visible in Ongoing Projects from creation or activation until it is completed or cancelled.
When its `dueDate` enters the configurable upcoming window, it also appears in Upcoming Deadlines.
A root task should not automatically flood Today Tasks every day merely because it remains open.
Actionable leaf tasks scheduled today, due today, or overdue normally appear in Today Tasks.
Its actionable children should normally appear there.
`scheduledDate` represents an intended actionable date.
`dueDate` represents a deadline.
Do not introduce a new `startDate` field in this ADR.

### 12. Parent-removal safety rule

MVP operations must not silently cascade-delete descendants.
MVP operations must not silently create orphan tasks.
Cancelling, archiving, or removing a parent with descendants requires an explicit user-confirmed strategy.
Preferred MVP behaviour is to preserve canonical records and use status changes rather than hard deletion.
Exact delete and archive UX is deferred.
Historical links, timer links, and future ledger references must remain preserved.

### 13. Ledger separation

Do not store reward-token balance, growth balance, or timer totals directly on mutable task records.

Later:

- task completion events belong in a ledger
- timer sessions link to task ids
- reward and growth calculations derive from ledger entries
- parent and child completion must not silently create duplicate rewards
- milestone reward policy is deferred to a later ADR

### 14. Markdown projection boundary

Markdown task trees are derived projections for readability.

Recommended projection shape:

```md
- [ ] Group assignment | due: 2026-06-20
  - [x] Discuss topic
  - [ ] Prepare slides | due: 2026-06-15
    - [ ] Create structure
    - [ ] Find images
  - [ ] Present | due: 2026-06-20
```

State clearly:

- canonical flat records remain the source of truth
- Markdown indentation is not the only canonical relationship source
- stable markers or managed-block details are deferred to ADR-003
- manual-edit conflict handling is deferred to ADR-003

### 15. Physical persistence format boundary

State explicitly:

- ADR-001 decides task record granularity and relationship semantics
- ADR-001 does not decide JSON versus JSONL versus other storage-file formats
- physical mutable-record storage format belongs to ADR-002 or a dedicated later decision

## Consequences

Positive consequences:

- one task model is easier to evolve
- reparenting preserves stable ids
- Agent breakdown can create ordinary task records
- timers and ledgers can link to stable task ids
- tree projections remain readable
- UI can distinguish Today Tasks from Ongoing Projects
- flat trees need deterministic sibling ordering

Trade-offs:

- relationship queries are required to reconstruct trees
- cycle prevention is required
- projection logic must be careful
- parent-removal flows require explicit handling
- exact progress weighting is deferred
- manual Markdown edit handling remains unresolved
- deep nesting is possible in storage but intentionally not prioritised in MVP UI

## Deferred Questions

- JSON vs JSONL vs another local mutable-record format
- exact sibling-order field representation
- managed-block markers in Markdown projection
- manual Markdown edit reconciliation
- delete/archive UX
- maximum visible UI nesting depth
- Agent-generated decomposition depth
- optional effort estimates
- weighted progress
- milestone reward policy
- recurring tasks
- habit hierarchy
- linked-note backlinks
- future Project entity threshold

## Revisit Conditions

- task tree queries become too slow
- users need project-specific fields not suitable for tasks
- Markdown reconciliation becomes fragile
- recurring tasks require a separate abstraction
- analytics require explicit effort weighting
- mobile UI needs stricter nesting constraints

## Related Documents

- [../daynest/architecture/daynest-storage-projection-decision-matrix-v1.md](../daynest/architecture/daynest-storage-projection-decision-matrix-v1.md)
- [../daynest/product/daynest-growth-economy-domain-design-v1.md](../daynest/product/daynest-growth-economy-domain-design-v1.md)
- [../daynest/architecture/daynest-data-template-analytics-architecture-v1.md](../daynest/architecture/daynest-data-template-analytics-architecture-v1.md)
- [../daynest/settings/daynest-daily-note-template-language-design-v1.md](../daynest/settings/daynest-daily-note-template-language-design-v1.md)
- [../daynest/README.md](../daynest/README.md)
- [README.md](./README.md)
