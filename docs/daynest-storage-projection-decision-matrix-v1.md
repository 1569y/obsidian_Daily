# DayNest Storage And Projection Decision Matrix v1

## 1. Purpose

This document is an MVP decision matrix for DayNest storage and projection architecture.

Its job is to:

- narrow implementation choices before canonical schema types are added
- make blocking storage and projection decisions explicit
- keep unresolved later-phase options visible

This document does not approve runtime implementation yet.

## 2. Decision Status Vocabulary

- `accepted for MVP`
- `accepted as future extension`
- `deferred`
- `rejected for MVP`
- `requires prototype`
- `requires user decision`

## 3. Mutable Canonical Domain Records Matrix

| Record | Canonical source | Proposed format | User-editable? | One-file-per-record or grouped? | `schemaVersion`? | Needs history ledger? | Needs Markdown projection? | MVP decision | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task | canonical mutable record | Markdown + YAML Properties | yes | one-file-per-record | yes | yes | yes | accepted for MVP | top-level tasks need inspectable state, Properties compatibility, and stable links |
| subtask | parent task record by default | embedded checklist items inside task Markdown | yes | grouped by parent by default | yes | yes when promoted | optional by parent | accepted for MVP | lowest-complexity default; avoid premature record explosion |
| project | canonical mutable record | Markdown + YAML Properties | yes | one-file-per-record | yes | optional | yes later | accepted as future extension | useful but not required for first storage MVP |
| milestone | canonical mutable record | Markdown + YAML Properties | yes | one-file-per-record | yes | optional | yes later | accepted as future extension | useful for long-horizon structure, but not blocking first MVP |
| habit | canonical mutable record | Markdown + YAML Properties | yes | one-file-per-record | yes | yes | yes | accepted as future extension | important directionally, but can follow after basic task path is stable |
| habit option | child record of habit by default | embedded structured child block or Properties list | yes | grouped by parent by default | yes | yes through check-in ledger | optional by parent | accepted as future extension | options belong with the parent habit unless they need independent lifecycle |
| reward item / `心愿卡` | canonical mutable record | Markdown + YAML Properties | yes | one-file-per-record | yes | yes through redemption ledger | yes | accepted as future extension | reward items need user-visible editing and stable metadata |
| summary | canonical mutable record plus projection boundary | Markdown + YAML Properties | partially | one-file-per-period | yes | optional | yes | deferred | summary can be canonical in some cases and generated in others; needs clearer split by summary type |
| template settings | canonical mutable settings record | plugin settings first, later exportable structured record | no direct vault edit in MVP | grouped settings record | yes | no | no | accepted for MVP | settings need stable typed storage before user-editable vault forms |
| narrative-label settings | canonical mutable settings record | plugin settings first, later exportable structured record | no direct vault edit in MVP | grouped settings record | yes | no | no | accepted as future extension | narrative-label customization is useful later, but not needed for first storage MVP |

## 4. Task And Subtask Granularity

### Comparison Matrix

| Option | Strengths | Risks | MVP status |
| --- | --- | --- | --- |
| one-file-per-task | inspectable, Git-friendly, easy linking, easy manual repair | many files at scale | accepted for MVP |
| grouped task index | fewer files, easier batch reading | harder merges, more write conflict risk, weaker per-task identity | deferred |
| embedded checklist subtasks | simple, familiar, low overhead | limited independent metadata | accepted for MVP |
| independent subtask records | strong identity and metadata | more complexity and more files | accepted as future extension |
| hybrid promotion model | simple default with escape hatch for complex subtasks | promotion rules must stay clear | accepted for MVP |

### Provisional Recommendation

- use one Markdown + YAML Properties file per top-level task
- use embedded checklist subtasks by default
- promote a subtask to an independent record only when it needs its own:
  - due date
  - timer linkage
  - reward evidence
  - notes
  - status lifecycle
- keep stable ids for promoted records
- do not approve recursive arbitrary-depth nesting in MVP

Reason:

- this keeps MVP task storage human-readable and low-complexity
- it also preserves a path toward richer subtask behavior without forcing that complexity onto every task

Boundary notes:

- first MVP task record storage is accepted without requiring full replayable state-change history
- first MVP task records may retain `createdAt`, `updatedAt`, and optional `completedAt`
- full replayable task state-change history belongs to the later action-event ledger
- a normal embedded checklist subtask inherits the parent task record `schemaVersion`
- only a promoted independent subtask record gets its own stable `id` and its own `schemaVersion`

## 5. Audit-Friendly Ledger Matrix

| Ledger | Canonical? | Append-only? | Correction strategy | Partitioning candidate | Required shared fields | MVP decision | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| action events | yes | preferably yes | adjustment event or superseding event | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?`, `dedupeKey?` | accepted as future extension | useful umbrella audit stream, but not the first blocking MVP ledger |
| timer sessions | yes | yes | correction or void/supersede event | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?`, `dedupeKey?` | accepted as future extension | timer evidence matters later, but timer runtime is not first storage MVP |
| habit check-ins | yes | yes | correction or compensating event | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?`, `dedupeKey?` | accepted as future extension | important later for habit analytics and rewards |
| progress XP transactions | yes | yes | adjustment event | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?`, `ruleVersion?`, `dedupeKey?`, `adjustmentReason?`, `supersedesEventId?` | accepted as future extension | needed once effort-based reward logic becomes real |
| attribute XP transactions | yes | yes | adjustment event | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?`, `ruleVersion?`, `dedupeKey?`, `adjustmentReason?`, `supersedesEventId?` | deferred | depends on attribute layer not being MVP-first |
| reward-token / `微光` transactions | yes | yes | adjustment event | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?`, `ruleVersion?`, `dedupeKey?`, `adjustmentReason?`, `supersedesEventId?` | accepted as future extension | required once spendable reward balance exists |
| reward redemptions | yes | preferably yes | reversal or superseding event | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?`, `ruleVersion?`, `dedupeKey?`, `adjustmentReason?`, `supersedesEventId?` | accepted as future extension | redemption needs durable audit once rewards are live |
| optional wellbeing observations | yes | preferably append-friendly | explicit correction or amended observation | monthly | `schemaVersion`, `id`, `type`, `occurredAt`, `createdAt`, `sourceId?`, `sourceType?` | deferred | sensitive and explicitly later-phase |

### Shared Field Notes

Recommended shared ledger field set:

- `schemaVersion`
- `id`
- `type`
- `occurredAt`
- `createdAt`
- `sourceId?`
- `sourceType?`
- `ruleVersion?`
- `dedupeKey?`
- `adjustmentReason?`
- `supersedesEventId?`

Rule:

- use the smallest common set necessary
- do not force reward-rule fields into ledgers that do not need them

## 6. Ledger Format Comparison

| Format | Append friendliness | Human readability | Git diff quality | Obsidian-native experience | Parsing complexity | Corruption recovery | Indexing implications | MVP suitability | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| monthly JSONL | high | medium | high | medium | medium | good per-line recovery | strong partitioning story | promising | requires prototype |
| JSON sidecar arrays | medium | low-medium | medium-low | low | low-medium | weaker if one file is malformed | simple but bulk-rewrite prone | possible | deferred |
| Markdown ledger | medium-low | high | medium | high | high for reliable parsing | good for user reading, weaker for machine guarantees | weak for large-scale aggregation | limited | rejected for MVP as primary ledger format |
| plugin data only | high internally | low user visibility | none in vault | low | low | tied to plugin data integrity | weak user inspectability | poor for canonical ledgers | rejected for MVP as canonical ledger store |

Decision:

- JSONL is not automatically approved
- JSONL requires a tiny prototype before acceptance

Reason:

- JSONL currently has the best balance for append-friendly audit streams
- but a prototype is still needed to verify Obsidian-local ergonomics, recovery behavior, and maintenance cost

## 7. Projection Strategy Matrix

| Strategy | Safe to regenerate? | User-edit risk | Stable marker needs | Overwrite policy | Intended examples | MVP decision |
| --- | --- | --- | --- | --- | --- | --- |
| append-only projection | usually yes | low for prior entries if no rewrite | none or minimal heading scope | do not rewrite prior entries | daily log entry | accepted for MVP |
| managed block | conditionally | medium-high | yes | scoped block only, never silent broader overwrite | long-task progress | deferred |
| generated snapshot | yes | medium if user edits generated area | recommended label/header | replace only generated snapshot scope | monthly settlement | accepted as future extension |
| user-authored note with linked reference | yes for linked fragment, not full note | low if link-only | none | do not overwrite user note body | linked daily note | accepted as future extension |

Required examples:

- daily log entry -> append-only projection
- long-task progress -> managed block candidate, deferred until marker design
- monthly settlement -> generated snapshot candidate
- linked daily note -> linked reference candidate

## 8. User-Edit Conflict Rules

- user-authored content must never be overwritten silently
- append-only projections do not rewrite prior entries
- managed blocks require stable markers and explicit scope
- generated snapshots must be clearly labeled generated
- projections remain rebuildable when practical
- canonical records and ledgers remain authoritative for analytics

## 9. Daily-Note Integration Settings Split

Resolved conceptual split:

- `integrationMode`
  - `daynest_only`
  - `write_to_existing_daily_note`
  - `linked_notes`
- `settingsSource`
  - `daynest_default`
  - `custom`
  - `imported_from_obsidian_daily_notes`

Explanation:

- `integrationMode` answers where and how DayNest writes
- `settingsSource` answers where configuration values came from

Decision:

- accepted for MVP as the preferred settings-model direction

## 10. Template Location Matrix

| Option | Pros | Risks | MVP decision |
| --- | --- | --- | --- |
| built-in templates | safest, versionable, deterministic | less user freedom | accepted for MVP |
| `customTemplate` string in plugin settings | simple early override path | limited editing UX, escaping concerns | accepted as future extension |
| vault template files | user-editable and inspectable | file-discovery UX and validation complexity | accepted as future extension |
| external Templater execution | flexible | unsafe, non-deterministic, external dependency | rejected for MVP |

Provisional recommendation:

- built-in templates for MVP
- custom settings string as an early optional extension
- vault template files as a later user-editable extension
- reject external script execution and Templater execution in MVP

## 11. Cache-Location Matrix

| Option | Pros | Risks | MVP decision |
| --- | --- | --- | --- |
| vault `data/cache/` | inspectable, exportable | vault clutter, confusion with canonical data | accepted as future extension |
| plugin data | cleaner user vault, easier ephemeral storage | less visible to users | accepted as future extension |
| no cache initially | simplest and safest | repeated recomputation cost later | accepted for MVP |

Provisional recommendation:

- no cache for first storage MVP
- plugin-data cache later for rebuildable dashboard read models
- vault export only for user-requested inspectable snapshots

## 12. Compatibility Matrix

| Target | Status | Notes |
| --- | --- | --- |
| Obsidian Properties | native compatibility | top candidate for mutable Markdown entity metadata |
| Obsidian Bases | optional adapter | useful if Properties-backed records stay clean |
| Dataview | optional adapter | should not dictate canonical storage design |
| Obsidian Tasks projection | deferred | valuable later, but not a hard MVP dependency |
| Daily Notes import | optional adapter | import path should remain optional and explicit |
| CLI adapter | deferred | later integration possibility, not a MVP dependency |

Rule:

- hard dependency is rejected for MVP for all of the above

## 13. Migration Safeguards

- `schemaVersion`
- `templateVersion`
- `ruleVersion`
- ledger replay where practical
- migration preview before destructive changes
- backup recommendation before significant migrations
- no silent destructive migrations
- old projections may remain readable
- historical events should not be silently rewritten

## 14. Explicit MVP Decisions Summary

| Decision | MVP choice | Why | Future extension point |
| --- | --- | --- | --- |
| top-level task storage | one Markdown + YAML Properties file per task | inspectable and simple | grouped views or indexes later |
| default subtask form | embedded checklist subtasks | low overhead | promoted independent records |
| subtask promotion | hybrid promotion model | supports richer subtasks only when needed | broader subtask records later |
| arbitrary deep nesting | not approved | complexity too high for MVP | later only with explicit schema design |
| canonical ledger format | not finalized yet | needs validation | JSONL prototype first |
| daily log projection | append-only | safest write strategy | richer linked or managed projections later |
| long-task progress projection | deferred managed block | marker design unresolved | ADR after marker prototype |
| monthly settlement projection | generated snapshot later | rebuildable report model | explicit generated sections later |
| daily-note settings split | `integrationMode` + `settingsSource` | resolves concept drift cleanly | none needed immediately |
| template location | built-in templates | safest and deterministic | custom setting string, then vault files |
| cache strategy | no cache initially | simplest safe MVP | plugin-data cache later |
| compatibility stance | optional adapters only | avoids format lock-in | staged adapters later |

## 15. Open Decisions Still Requiring A Prototype Or User Approval

- JSONL prototype result
- promoted-subtask UX
- linked-note backlink behavior
- managed-block markers
- vault template-file UX
- narrative-label customization
- whether game-layer visibility can be reduced or disabled

## 16. Next Recommended Artifact

Recommended next step:

- `docs/adr/`

First ADR candidates:

- ADR-001: top-level task storage and subtask promotion model
- ADR-002: ledger format after JSONL prototype
- ADR-003: projection write strategy and managed-block marker rules
- ADR-004: daily-note settings split and naming model

Canonical schema types should be added only after this matrix is reviewed.
