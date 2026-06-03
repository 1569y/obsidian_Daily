# Documentation Reorganization Plan v1

## 1. Purpose

This document is a documentation-governance migration plan.

It does not move, rename, delete, or rewrite existing files in this batch.

Its goal is to establish:

- stable source-of-truth locations
- stable module entry points
- clear historical checkpoint handling
- a future architecture decision record path

This is documentation-only planning.

No runtime implementation is approved by this document.

## 2. Documentation Principles

- keep one global entry point at `docs/INDEX.md`
- keep one current-state summary at `docs/CURRENT.md`
- keep one `README.md` entry point per major module area
- treat living docs as editable current-state documents
- keep historical checkpoints readable, but do not treat them as implementation instructions
- treat accepted ADRs as immutable records that may later be superseded by newer ADRs
- use repository-relative internal links
- avoid duplicating full content across summary and detailed docs
- prefer small canonical files over large mixed-purpose documents

## 3. Proposed Target Docs Tree

```text
docs/
  INDEX.md
  CURRENT.md

  daynest/
    README.md
    product/
    architecture/
    narrative/
    settings/
    checkpoints/

  moodnest/
    README.md
    product/
    safety/
    evaluation/

  shared/
    architecture/

  adr/
    README.md
    daynest/

  archive/
    README.md
```

## 4. File Migration Matrix

| Current path | Proposed target path | Area | Role | Action | Reason |
| --- | --- | --- | --- | --- | --- |
| `docs/INDEX.md` | `docs/INDEX.md` | governance | governance entry | keep in place temporarily | global navigation entry should stay stable while later moves happen under it |
| `docs/documentation-audit-v1.md` | `docs/archive/documentation-audit-v1.md` | governance | governance entry | keep in place temporarily; archive later | useful governance snapshot, but not intended as a permanent top-level entry point |
| `docs/daynest-storage-projection-decision-matrix-v1.md` | `docs/daynest/architecture/daynest-storage-projection-decision-matrix-v1.md` | DayNest | active supporting doc | move later; add relative-link update later; add status header later | active decision-prep document that belongs with DayNest architecture guidance until superseded by ADRs |
| `docs/daynest-growth-economy-domain-design-v1.md` | `docs/daynest/product/daynest-growth-economy-domain-design-v1.md` | DayNest | active source of truth | move later; add relative-link update later; add status header later | primary DayNest product and domain direction should live under DayNest product |
| `docs/daynest-data-template-analytics-architecture-v1.md` | `docs/daynest/architecture/daynest-data-template-analytics-architecture-v1.md` | DayNest | active source of truth | move later; add relative-link update later; add status header later | primary DayNest data and projection architecture should live under DayNest architecture |
| `docs/daynest-daily-note-template-language-design-v1.md` | `docs/daynest/settings/daynest-daily-note-template-language-design-v1.md` | DayNest | active source of truth | move later; add relative-link update later; add status header later | current canonical daily-note integration and template-settings direction belongs in DayNest settings |
| `docs/daynest-narrative-language-design-v1.md` | `docs/daynest/narrative/daynest-narrative-language-design-v1.md` | DayNest | active supporting doc | move later; add relative-link update later; add status header later | visible terminology and narrative tone belong in a distinct DayNest narrative area |
| `docs/daynest-daily-note-user-settings-v1.md` | `docs/daynest/settings/daynest-daily-note-user-settings-v1.md` | DayNest | active supporting doc | move later; add relative-link update later; add status header later | partially superseded settings-thinking document should remain accessible near newer DayNest settings docs |
| `docs/daynest-daily-agent-design-v1.md` | `docs/daynest/checkpoints/daynest-daily-agent-design-v1.md` | DayNest | historical checkpoint | move later; add relative-link update later; add status header later | milestone-era DayNest checkpoint should stay readable without competing with current source-of-truth docs |
| `docs/daynest-daily-agent-design-review-v1.md` | `docs/daynest/checkpoints/daynest-daily-agent-design-review-v1.md` | DayNest | historical checkpoint | move later; add relative-link update later; add status header later | review checkpoint is useful development history, not a current implementation instruction |
| `docs/daynest-manual-test-command-design-v1.md` | `docs/daynest/checkpoints/daynest-manual-test-command-design-v1.md` | DayNest | historical checkpoint | move later; add relative-link update later; add status header later | completed checkpoint should remain available as history only |
| `docs/moodnest-product-design-v1.md` | `docs/moodnest/product/moodnest-product-design-v1.md` | MoodNest | active source of truth | move later; add relative-link update later; add status header later | primary MoodNest product identity belongs under MoodNest product |
| `docs/moodnest-information-architecture-v1.md` | `docs/moodnest/product/moodnest-information-architecture-v1.md` | MoodNest | active supporting doc | move later; add relative-link update later; add status header later | broad MoodNest structure doc belongs under MoodNest product with partial-supersession metadata later |
| `docs/dialogue-tone-guide.md` | `docs/moodnest/safety/dialogue-tone-guide.md` | MoodNest | active source of truth | move later; add relative-link update later; add status header later | tone calibration is core MoodNest safety and support behavior guidance |
| `docs/moodnest-support-strategy-map.md` | `docs/moodnest/safety/moodnest-support-strategy-map.md` | MoodNest | active source of truth | move later; add relative-link update later; add status header later | strategy and safety handling should live in MoodNest safety |
| `docs/moodnest-mini-eval-v1.md` | `docs/moodnest/evaluation/moodnest-mini-eval-v1.md` | MoodNest | active source of truth | move later; add relative-link update later; add status header later | primary MoodNest evaluation protocol belongs in MoodNest evaluation |
| `docs/moodnest-mini-eval-v1.json` | `docs/moodnest/evaluation/moodnest-mini-eval-v1.json` | MoodNest | evaluation artifact | move later; add relative-link update later; add status header later | companion machine-readable evaluation artifact should stay beside the markdown evaluation doc |
| `docs/architecture/module-map.md` | `docs/shared/architecture/module-map.md` | shared | active supporting doc | move later; add relative-link update later; add status header later | repo structure map is shared architecture support, not a product doc |
| `docs/architecture/startup-chain.md` | `docs/shared/architecture/startup-chain.md` | shared | active supporting doc | move later; add relative-link update later; add status header later | startup-shape reference belongs in shared architecture with time-sensitive status labeling later |
| `docs/architecture/bundle-risk.md` | `docs/shared/architecture/bundle-risk.md` | shared | active supporting doc | move later; add relative-link update later; add status header later | bundle-risk analysis is shared technical support documentation |
| `docs/architecture/safe-refactor-plan.md` | `docs/shared/architecture/safe-refactor-plan.md` | shared | historical checkpoint | move later; add relative-link update later; add status header later | refactor-era plan remains useful context, but should not be mistaken for current architecture instructions |

## 5. Module Entry-Point Design

### `docs/INDEX.md`

Role:

- the single global navigation entry
- the first stop for conflict resolution
- the cross-module boundary guide

It should answer:

- where current source-of-truth docs live
- which docs are supporting versus historical
- which unresolved decisions still need ADRs or decision matrices

### `docs/CURRENT.md`

Role:

- the compact current-state snapshot
- the fastest way to learn what is active now

It should answer:

- which documents are currently canonical
- what the latest reviewed checkpoints are
- which decisions are actively pending

It should not duplicate full document content.

### `docs/daynest/README.md`

Role:

- the DayNest module entry
- the DayNest-local navigation map

It should answer:

- which DayNest product, architecture, narrative, settings, and checkpoint docs are current
- which DayNest docs are historical
- which DayNest ADRs matter most

### `docs/moodnest/README.md`

Role:

- the MoodNest module entry
- the MoodNest-local navigation map

It should answer:

- which MoodNest product, safety, and evaluation docs are canonical
- which supporting docs are partially superseded
- where MoodNest boundaries stop and DayNest ownership begins

### `docs/adr/README.md`

Role:

- the ADR index
- the rulebook for how ADRs are named, accepted, and superseded

It should answer:

- how to read ADR status
- how to record a superseding ADR
- which ADRs are active for DayNest and later shared architecture

### `docs/archive/README.md`

Role:

- the archive entry point
- the explanation of why a document moved out of active areas

It should answer:

- what counts as historical
- how to find the active replacement for an archived file
- how archive links should point back to current docs

## 6. Status Metadata Format

Recommended future YAML frontmatter:

```yaml
---
status: active-source-of-truth
scope: daynest-architecture
last-reviewed-checkpoint: DayNest 1M-0D
supersedes:
  - docs/daynest-daily-note-user-settings-v1.md
superseded-by: null
---
```

Recommended `status` values:

- `active-source-of-truth`
- `active-supporting`
- `historical-checkpoint`
- `partially-superseded`
- `archived`
- `draft`

Field intent:

- `status`: current governance state of the document
- `scope`: owning product or architecture area
- `last-reviewed-checkpoint`: latest review or milestone reference
- `supersedes`: older docs partially or fully replaced by this document
- `superseded-by`: newer doc or ADR that replaced this document

## 7. Update Workflow

When product vision changes:

- update the owning product source-of-truth doc first
- then update `docs/CURRENT.md`
- then adjust `docs/INDEX.md` only if conflict priority or classification changed

When narrative terminology changes:

- update the owning narrative or tone doc first
- then update any summary entry points that point to it
- do not silently rename internal identifiers unless the architecture docs also approve that change

When template design changes:

- update the DayNest settings or template source-of-truth doc first
- update the DayNest architecture doc if the change affects rendering boundaries or projection rules
- update `docs/CURRENT.md` if the canonical reference changed

When storage architecture changes:

- update the DayNest architecture doc or adopt a new ADR
- if the change is accepted architecture policy, prefer ADR creation over spreading the decision across multiple design docs
- then update `docs/INDEX.md` and `docs/CURRENT.md` to reflect the new canonical reference

When a runtime milestone is completed:

- update the relevant current-state docs
- mark milestone-era design docs or reviews as historical or partially superseded
- add or refresh `last-reviewed-checkpoint` metadata later

When a document becomes historical:

- first ensure `docs/INDEX.md` and module `README.md` files point to the active replacement
- then move the document into `docs/archive/` in a later docs-only batch
- then set `status: archived` or `historical-checkpoint`

When an accepted architecture decision changes:

- do not rewrite the accepted ADR body
- create a new ADR that supersedes the earlier one
- update `docs/adr/README.md`, `docs/CURRENT.md`, and any affected module `README.md`

## 8. Migration Order

Recommended order:

1. `Docs-1`: migration plan only
2. `Docs-2`: create `docs/CURRENT.md` and module `README.md` entry points
3. `Docs-3`: move files in one docs-only batch and fix relative links
4. `Docs-4`: add status metadata headers
5. `Docs-5`: create `docs/archive/` and `docs/adr/` structure
6. create `ADR-001`
7. only after `ADR-001` review, add canonical task schema types

Reason:

- entry points should exist before file moves
- file moves should happen before metadata is spread across the new tree
- ADR structure should exist before high-impact architecture decisions become implementation drivers
- schema work should wait until the first accepted architecture decision is stable

## 9. Risks

- broken relative links after file moves
- duplicate sources of truth if summaries and detailed docs drift apart
- accidentally treating a checkpoint as current
- over-fragmentation into too many tiny files
- very large summary documents that duplicate detailed docs
- moving files before index links and entry points are stable
- touching runtime code during docs-only governance work

## 10. Strict Boundary

- documentation-only planning
- no moves
- no renames
- no deletions
- no runtime edits
- no schema implementation
- no renderer implementation
- no storage implementation
- no settings UI

No runtime behavior is approved by this document.
