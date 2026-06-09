---
status: proposed
scope: daynest-task-canonical-persistence-format-decision
last-reviewed-checkpoint: adr-002a
supersedes: []
superseded-by: []
---

# ADR-002: DayNest Task Canonical Persistence Format

## Status

proposed

## Context

ADR-001 established one unified flat `DayNestTaskRecord` model with optional `parentTaskId`.

The task domain now has isolated foundations for:

- `DayNestTaskDraft`
- `createDayNestTaskRecord(...)`
- `DayNestTaskRecord`
- `DayNestTaskRepository`
- `serializeDayNestTaskRecordAsCheckbox(...)`

These helpers remain isolated.

There is still:

- no task repository implementation
- no task executor
- no task-writing runtime path

Before persistence is implemented, DayNest must decide the physical format for mutable canonical task state.

This decision must keep clear boundaries between:

- canonical mutable task state
- Markdown task projections
- daily-note append entries
- future ledgers
- analytics read models
- caches

Early path helpers still lean toward one Markdown file per task.
That path shape remains provisional and is not authoritative for canonical task persistence.

Managed-block behavior and manual Markdown-edit reconciliation remain deferred to ADR-003.

## Decision Drivers

- local-first storage
- simple MVP implementation
- clear source-of-truth boundary
- compatibility with ADR-001 flat `parentTaskId` relationships
- deterministic serialization
- migration safety
- avoiding premature managed-block reconciliation
- avoiding task-file clutter
- acceptable mobile behavior
- future ledger separation
- rebuildable Markdown projections
- future analytics compatibility
- auditability
- ability to migrate later if scale or sync-conflict pressure increases

## Options Considered

### Option 1: One Markdown file per task as canonical mutable storage

Pros:

- highly readable in Obsidian
- easy to inspect manually
- Git diffs can stay localized per task

Cons:

- mutable canonical state becomes entangled with user-facing Markdown shape
- structured updates are harder to keep deterministic
- pushes managed-block and manual-edit questions too early
- creates task-file clutter

### Option 2: One aggregate Markdown file containing canonical task state

Pros:

- reduces file clutter
- keeps everything in one visible location

Cons:

- combines bulk rewrite cost with Markdown parsing complexity
- less clear than JSON for canonical structured state
- weaker separation between state and projection concerns

### Option 3: One aggregate JSON file containing canonical `DayNestTaskRecord` records

Pros:

- simple machine-readable canonical source
- easy `listAll()` loading and full validation
- clear fit for flat task records with `parentTaskId`
- straightforward migration entry point through `schemaVersion`

Cons:

- full-document rewrites for updates
- larger corruption blast radius than per-record files
- concurrent sync conflicts affect the whole file

### Option 4: One JSON file per canonical task record

Pros:

- strong per-record isolation
- smaller corruption blast radius
- more localized sync conflicts

Cons:

- more files and more vault clutter
- directory scanning and indexing pressure arrive earlier
- more implementation complexity for the MVP

### Option 5: JSONL append-only storage used directly as mutable canonical task state

Pros:

- append-friendly
- audit-friendly
- compatible with future event-stream thinking

Cons:

- weak fit for mutable current-state storage
- current state requires replay or compaction
- conflates canonical mutable state with ledger concerns too early

### Option 6: Hybrid architecture

- mutable canonical task records stored in aggregate JSON
- Markdown generated as derived projection
- future append-only JSONL ledger stored separately
- future cache and analytics read models rebuildable

Pros:

- preserves a clear source-of-truth boundary
- keeps canonical state structured and deterministic
- keeps Markdown human-readable without making it canonical
- leaves ledger design independent
- fits the current isolated task foundations cleanly

Cons:

- aggregate-file rewrite cost remains
- future migration thresholds still need review

### Recommendation

Recommend Option 6.

## Decision

### 1. Canonical mutable task state

The source of truth for mutable DayNest task state is one aggregate JSON document.

The logical file name is:

`tasks.json`

The exact vault-relative parent directory remains deferred to the subsequent storage-path implementation batch.

### 2. JSON envelope

Recommend a versioned envelope equivalent to:

```json
{
  "schemaVersion": 1,
  "tasks": []
}
```

State:

- `schemaVersion` supports future migrations
- `tasks` contains canonical `DayNestTaskRecord` objects
- task ids must remain unique
- records retain flat `parentTaskId` relationships
- `sortOrder` remains canonical sibling-order metadata
- deterministic serialization order is required
- the exact sorting implementation belongs to a later pure codec/helper batch

### 3. Markdown is projection

Markdown task checkboxes are derived human-readable projections.

State:

- Markdown is not the sole canonical source of truth
- projections may be rebuilt from canonical task records
- `serializeDayNestTaskRecordAsCheckbox(...)` is an isolated flat helper only
- tree rendering remains later work
- managed blocks remain deferred to ADR-003
- manual Markdown-edit reconciliation remains deferred to ADR-003

### 4. Daily notes remain projection territory

State:

- daily-note task entries are derived append-only projections
- daily notes do not become canonical mutable task storage
- current `append_daily_log` runtime behavior remains separate

### 5. Future ledger remains separate

State:

- task history, completion events, status transitions, reward-token changes, growth changes, and timer-derived events must not be embedded into `tasks.json` as an event history stream
- a future append-only ledger may use JSONL or another append-friendly format
- exact ledger schema and path remain deferred

### 6. Analytics and cache remain derived

State:

- analytics read models derive from canonical records and future ledgers
- caches are rebuildable, disposable, and never canonical

### 7. Manual JSON editing

State:

- `tasks.json` remains local and inspectable
- direct manual editing is not the primary supported UX
- invalid JSON must never be silently overwritten
- parse failure, backup, and safe-write behavior belong to repository implementation design
- manual Markdown-edit reconciliation remains ADR-003 territory

### 8. Migration path

State:

- aggregate `tasks.json` is the MVP choice
- migration to per-record JSON files under a records directory may be revisited if:
  - task count grows substantially
  - sync conflicts become frequent
  - partial-update isolation becomes important
  - mobile performance degrades
- the initial `schemaVersion` field supports later migration

### 9. Repository contract boundary

State:

- the existing `DayNestTaskRepository` placeholder contract is sufficient for the first repository implementation
- `save(...)` semantics remain intentionally provisional
- create/update separation, richer result objects, and overwrite rules should be reviewed in a later narrow code-design batch
- ADR-002 does not modify TypeScript contracts

## Consequences

Positive consequences:

- clear machine-readable source of truth
- simple MVP loading and saving
- clean separation between mutable state and Markdown projections
- no need to solve managed-block reconciliation now
- easy `listAll()` implementation
- easy schema migration entry point
- future ledger remains independent
- cache and analytics layers remain rebuildable

Trade-offs:

- aggregate file writes may rewrite the full document
- corruption blast radius is larger than per-record JSON
- concurrent sync conflicts may affect the whole file
- direct human editing is possible but not the primary workflow
- deterministic serialization and safe-write behavior are required
- scale thresholds for migration remain unresolved

## Deferred Questions

- exact vault-relative `tasks.json` path
- parse-failure handling
- backup strategy
- safe-write technique
- deterministic record ordering algorithm
- create/update/save contract semantics
- overwrite and duplicate-id rules
- JSON codec helper design
- per-record JSON migration threshold
- ledger schema and physical format
- ledger path
- cache location
- analytics read-model storage
- managed-block syntax
- manual Markdown-edit reconciliation
- tree projection format
- conflict resolution across devices

## Revisit Conditions

- aggregate file becomes too large
- sync conflicts become frequent
- mobile load/save performance degrades
- repository needs partial-update isolation
- backup and corruption blast-radius concerns become unacceptable
- manual editing becomes a first-class requirement
- future ledger or analytics workloads require a different storage layout

## Related Documents

- [ADR-001-task-storage-and-subtask-promotion.md](./ADR-001-task-storage-and-subtask-promotion.md)
- [../daynest/architecture/daynest-data-template-analytics-architecture-v1.md](../daynest/architecture/daynest-data-template-analytics-architecture-v1.md)
- [../daynest/architecture/daynest-storage-projection-decision-matrix-v1.md](../daynest/architecture/daynest-storage-projection-decision-matrix-v1.md)
- [README.md](./README.md)
