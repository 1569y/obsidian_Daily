---
status: historical-checkpoint
scope: documentation-audit-snapshot
last-reviewed-checkpoint: docs-4b-3c
supersedes: []
superseded-by:
  - ./INDEX.md
  - ./documentation-reorganization-plan-v1.md
---

# Documentation Audit v1

## 1. Purpose

This report audits the current `docs/` tree before further DayNest implementation.

It is a read-only audit of existing documentation plus one new audit file.

Audit goals:

- identify active documents
- identify historical checkpoints
- identify partial supersession and naming drift
- identify missing governance and index structure
- recommend the next documentation order before more implementation

## 2. Inventory Summary

Audited pre-existing documentation set:

- 18 files total
- 17 Markdown documents
- 1 JSON evaluation artifact

Newly added in this batch:

- 1 Markdown audit report

Current docs tree total after adding this report:

- 19 files total

Area split:

- DayNest: 8
- MoodNest: 5
- shared architecture: 4
- evaluation artifact: 1

## 3. Full Documentation Inventory

| Path | Area | Role | Current status | Recommended action | Reason |
| --- | --- | --- | --- | --- | --- |
| `docs/architecture/bundle-risk.md` | shared architecture | architecture | active supporting document | keep and add status header later | still useful for current build-shape and bundle-risk understanding |
| `docs/architecture/module-map.md` | shared architecture | architecture | active supporting document | keep and add status header later | still useful as a code responsibility map for current repo |
| `docs/architecture/safe-refactor-plan.md` | shared architecture | architecture | partially superseded | keep and add status header later | still useful as refactor intent, but some staged assumptions predate later DayNest checkpoints |
| `docs/architecture/startup-chain.md` | shared architecture | architecture | partially superseded | keep and add status header later | startup graph explanation is useful, but runtime checkpoint details are time-sensitive |
| `docs/daynest-daily-agent-design-review-v1.md` | DayNest | implementation checkpoint | historical checkpoint | archive later | narrows an early DayNest MVP and explicitly assumes no runtime DayNest yet |
| `docs/daynest-daily-agent-design-v1.md` | DayNest | product design | historical checkpoint | archive later | important origin document, but now conflicts with current DayNest runtime checkpoint and later product direction |
| `docs/daynest-daily-note-template-language-design-v1.md` | DayNest | architecture | active source of truth | keep | current source for daily-note integration modes, template boundaries, and language direction |
| `docs/daynest-daily-note-user-settings-v1.md` | DayNest | product design | partially superseded | keep and add status header later | still useful for settings-source thinking, but its mode model drifted from newer integration-mode design |
| `docs/daynest-data-template-analytics-architecture-v1.md` | DayNest | architecture | active source of truth | keep | current source for canonical data vs projections vs analytics vs caches |
| `docs/daynest-growth-economy-domain-design-v1.md` | DayNest | product design | active source of truth | keep | current primary product/domain document for DayNest as a growth ledger |
| `docs/daynest-manual-test-command-design-v1.md` | DayNest | implementation checkpoint | historical checkpoint | archive later | records a completed checkpoint that has already moved into runtime |
| `docs/daynest-narrative-language-design-v1.md` | DayNest | product design | active supporting document | keep | current narrative-language and visible terminology guide for DayNest |
| `docs/dialogue-tone-guide.md` | MoodNest | safety policy | active source of truth | keep | current tone and phrasing reference for MoodNest responses |
| `docs/moodnest-information-architecture-v1.md` | MoodNest | product design | partially superseded | keep and add status header later | still useful for broad structure, but some task/growth ideas now belong more clearly to DayNest |
| `docs/moodnest-mini-eval-v1.json` | evaluation | evaluation artifact | active supporting document | keep | machine-readable evaluation cases supporting the markdown eval doc |
| `docs/moodnest-mini-eval-v1.md` | MoodNest | evaluation artifact | active source of truth | keep | current evaluation protocol and scoring reference for MoodNest reply quality |
| `docs/moodnest-product-design-v1.md` | MoodNest | product design | active source of truth | keep | strongest current high-level product identity document for MoodNest |
| `docs/moodnest-support-strategy-map.md` | MoodNest | safety policy | active source of truth | keep | current strategy map for support behavior, scene handling, and high-risk boundaries |

## 4. Proposed DayNest Document Hierarchy

### Primary source-of-truth documents

- `docs/daynest-growth-economy-domain-design-v1.md`
  - primary product and domain direction
- `docs/daynest-data-template-analytics-architecture-v1.md`
  - primary data, projection, template, analytics, and cache architecture direction
- `docs/daynest-daily-note-template-language-design-v1.md`
  - primary daily-note integration and template-safety direction

### Active supporting design documents

- `docs/daynest-narrative-language-design-v1.md`
  - visible language, terminology, and narrative-layer guidance
- `docs/daynest-daily-note-user-settings-v1.md`
  - useful settings-source history, but should later be reconciled with newer integration-mode design

### Historical checkpoint documents

- `docs/daynest-daily-agent-design-v1.md`
- `docs/daynest-daily-agent-design-review-v1.md`
- `docs/daynest-manual-test-command-design-v1.md`

Recommended rule:

- DayNest should have a small number of current source-of-truth docs
- milestone and pre-runtime checkpoint docs should remain readable, but should later be explicitly marked historical

## 5. Proposed MoodNest Document Hierarchy

### Primary active MoodNest documents

- `docs/moodnest-product-design-v1.md`
  - product identity and scope
- `docs/dialogue-tone-guide.md`
  - language style and tone calibration
- `docs/moodnest-support-strategy-map.md`
  - support strategy, guardrails, and scene handling
- `docs/moodnest-mini-eval-v1.md`
  - evaluation protocol
- `docs/moodnest-mini-eval-v1.json`
  - evaluation artifact companion

### Active supporting MoodNest documents

- `docs/moodnest-information-architecture-v1.md`
  - still useful, but should later be marked as partially superseded where DayNest now owns more of the task/growth direction

### Implementation-history or architecture-support artifacts

- `docs/architecture/module-map.md`
- `docs/architecture/startup-chain.md`
- `docs/architecture/bundle-risk.md`
- `docs/architecture/safe-refactor-plan.md`

These are valuable, but they are not product source-of-truth documents.

## 6. Conflict Matrix

| Drift or conflict | Affected docs | Current reading | Recommendation |
| --- | --- | --- | --- |
| Early claim that DayNest has no runtime code yet | `daynest-daily-agent-design-v1.md`, `daynest-daily-agent-design-review-v1.md` | historically true when written, now stale | mark as historical checkpoints with reviewed checkpoint metadata |
| Daily-note mode drift: `custom / daynest_default / import_from_obsidian_daily_notes` vs `daynest_only / write_to_existing_daily_note / linked_notes` | `daynest-daily-note-user-settings-v1.md`, `daynest-daily-note-template-language-design-v1.md` | real model drift, not just wording drift | split later into `integrationMode` and `settingsSource` in a decision matrix |
| Timer postponed in early MVP review vs timer as later effort evidence | `daynest-daily-agent-design-review-v1.md`, `daynest-growth-economy-domain-design-v1.md` | not a contradiction if one is MVP and one is long-term, but phase boundaries are implicit | add explicit phase/status headers later |
| Markdown-first storage vs canonical-record / ledger / projection split | `daynest-daily-agent-design-v1.md`, `daynest-daily-agent-design-review-v1.md`, `daynest-data-template-analytics-architecture-v1.md` | architecture evolved from simple Markdown-first MVP thinking to layered data architecture | keep both, but label older docs as milestone-era storage assumptions |
| `Effort XP / Growth Coin` vs visible `成长值 / 微光 / 提灯` terminology | `daynest-growth-economy-domain-design-v1.md`, `daynest-narrative-language-design-v1.md`, `daynest-data-template-analytics-architecture-v1.md` | newer docs mostly align on neutral internal fields plus visible labels | preserve internal-neutral vs visible-label split and document it in a future glossary/index |
| `心愿单 / 心愿卡 / 心愿驿站 / 点亮心愿` distinction | `daynest-narrative-language-design-v1.md`, `daynest-growth-economy-domain-design-v1.md` | narrative doc now clarifies it; domain doc stays more abstract | later add a short terminology registry/index entry so all docs reference the same distinction |
| Template safety evolved from basic variables to allowlisted safe render contexts | `daynest-daily-note-template-language-design-v1.md`, `daynest-data-template-analytics-architecture-v1.md` | newer architecture doc is the more mature safety model | treat the newer architecture doc as the higher-level safety refinement, not a contradiction |
| Older milestone assumptions now completed | `daynest-manual-test-command-design-v1.md`, `daynest-daily-agent-design*` | several docs describe future checkpoints that now exist in runtime | mark as historical checkpoints instead of deleting |
| MoodNest product docs include task/growth/game-layer ideas now closer to DayNest | `moodnest-information-architecture-v1.md`, `moodnest-product-design-v1.md` | some future-facing task/growth language predates clearer DayNest separation | keep, but later add scope headers to distinguish active MoodNest scope from later DayNest ownership |

## 7. Proposed Document Governance Model

### Index recommendation

Recommended future artifact:

- `docs/INDEX.md`

Reason:

- the docs tree now has enough volume and enough partial supersession that a manual read is no longer enough
- an index should exist before archival moves or broad status relabeling

### Recommended per-document status metadata

Add later to each doc:

- `Status`
- `Scope`
- `Supersedes`
- `Superseded by`
- `Last reviewed checkpoint`

Suggested example format:

```md
Status: active source of truth
Scope: DayNest daily-note integration and template policy
Supersedes: docs/daynest-daily-note-user-settings-v1.md (partially)
Superseded by: none
Last reviewed checkpoint: DayNest 1M-0C
```

### Archive strategy

Recommended later:

- move clearly historical docs into `docs/archive/`
- only do this after `docs/INDEX.md` exists and links are stable

### Architecture decision record recommendation

Recommended later:

- create `docs/adr/`

Use ADRs for:

- storage format decisions
- task record granularity decisions
- projection write strategy
- cache location
- migration strategy

## 8. Proposed Cleanup Plan

### Safe immediate cleanup later

- add `docs/INDEX.md`
- add status headers to all active and historical docs
- explicitly tag historical checkpoint docs as historical
- add cross-links from older DayNest docs to newer source-of-truth docs

### Cleanup requiring user approval

- move historical documents into `docs/archive/`
- merge or retire partially superseded docs
- introduce `docs/adr/` and decide what gets split from product docs into decision records

### Files that should not be deleted

- `docs/moodnest-product-design-v1.md`
- `docs/dialogue-tone-guide.md`
- `docs/moodnest-support-strategy-map.md`
- `docs/moodnest-mini-eval-v1.md`
- `docs/moodnest-mini-eval-v1.json`
- `docs/daynest-growth-economy-domain-design-v1.md`
- `docs/daynest-data-template-analytics-architecture-v1.md`
- `docs/daynest-daily-note-template-language-design-v1.md`
- `docs/daynest-narrative-language-design-v1.md`

### Files that should only be archived after an index exists

- `docs/daynest-daily-agent-design-v1.md`
- `docs/daynest-daily-agent-design-review-v1.md`
- `docs/daynest-manual-test-command-design-v1.md`
- `docs/daynest-daily-note-user-settings-v1.md`
- `docs/architecture/safe-refactor-plan.md`
- `docs/architecture/startup-chain.md`

## 9. Unresolved Decisions For The Next Decision-Matrix Document

These should be captured explicitly before more DayNest implementation:

- one-file-per-task versus grouped task index
- embedded checklist subtasks versus independent subtask records
- JSONL versus JSON sidecars versus Markdown-ledger formats
- append-only projection versus managed block versus generated snapshot
- user-edit conflict behavior for Markdown projections
- cache location: vault versus plugin data
- custom templates in settings versus vault files
- whether limited Mustache-style sections are supported later
- linked-note backlink behavior
- schema migration strategy
- whether older daily-note `mode` and newer `integrationMode` become separate fields
- where narrative-label customization belongs and how optional it should be

## 10. Next Recommended Documentation Artifact

Recommended order:

1. `docs/INDEX.md`
2. `docs/daynest-storage-projection-decision-matrix-v1.md`
3. `docs/adr/`

Reason:

- the index should come first because the current tree already has multiple active sources, checkpoints, and partially superseded docs
- the storage/projection decision matrix should come second because it resolves the most implementation-blocking DayNest architecture choices
- ADRs should follow once the first high-impact architecture decisions start being locked in

## 11. Audit Conclusion

Current assessment:

- the docs tree is useful and information-rich
- the main risk is not lack of content, but lack of governance and status labeling
- DayNest now has a newer cluster of source-of-truth docs that outgrew several earlier milestone documents
- MoodNest still has a strong active core, but some broader roadmap language should later be scoped more clearly now that DayNest owns more of the growth-ledger direction

No runtime implementation is approved by this audit.
