---
status: active-source-of-truth
scope: documentation-navigation-index
last-reviewed-checkpoint: adr-001b
supersedes: []
superseded-by: []
---

# Documentation Index

## 1. Purpose

This file is the main navigation entry for the current documentation tree.

It is also the conflict-resolution map for overlapping or time-sensitive documents.

Use this file first when:

- deciding which document is the current source of truth
- checking whether a document is active, supporting, or historical
- resolving conflicts between older milestone-era assumptions and newer DayNest direction

## 2. Product Boundary

### MoodNest

MoodNest is the emotional-support assistant.

Its active documentation should be read as the source of truth for:

- support identity
- reply tone
- safety handling
- evaluation standards

### DayNest

DayNest is the action and local-first personal-growth ledger.

Its active documentation should be read as the source of truth for:

- growth-ledger direction
- data architecture
- daily-note integration direction
- template and projection boundaries

### NestHub

NestHub is the future multi-assistant shell and cross-module coordination layer.

It is not yet the active runtime structure.

### Boundary Rule

Raw MoodNest chat must not silently flow into DayNest.

## 3. DayNest Current Source-Of-Truth Documents

### [daynest-growth-economy-domain-design-v1.md](./daynest/product/daynest-growth-economy-domain-design-v1.md)

Role:

- primary DayNest product and domain direction

Answers:

- what DayNest is becoming
- how tasks, habits, timers, growth economy, rewards, attributes, and optional wellbeing fit together
- what DayNest should and should not reward

Conflict priority:

- highest priority for DayNest product/domain questions

### [daynest-data-template-analytics-architecture-v1.md](./daynest/architecture/daynest-data-template-analytics-architecture-v1.md)

Role:

- primary DayNest data, projection, template, analytics, and cache architecture guide

Answers:

- what is canonical data
- what is a ledger
- what is a Markdown projection
- what templates may and may not do
- how analytics and caches should be derived

Conflict priority:

- highest priority for DayNest storage, template, analytics, and cache questions

### [daynest-daily-note-template-language-design-v1.md](./daynest/settings/daynest-daily-note-template-language-design-v1.md)

Role:

- primary DayNest daily-note integration and template-safety guide

Answers:

- daily-note integration modes
- daily-note and template settings direction
- built-in language direction
- template safety boundaries

Conflict priority:

- highest priority for DayNest daily-note integration and template-setting questions

## 4. DayNest Active Supporting Documents

### [daynest-narrative-language-design-v1.md](./daynest/narrative/daynest-narrative-language-design-v1.md)

Role:

- visible terminology, narrative tone, and presentation-language guide

Clarification:

- this document defines user-facing narrative labels and tone
- it does not override neutral internal identifiers in data models

### [daynest-daily-note-user-settings-v1.md](./daynest/settings/daynest-daily-note-user-settings-v1.md)

Role:

- historical-to-current bridge for DayNest daily-note settings thinking

Clarification:

- this document is partially superseded
- it should not be treated as the final settings schema
- read it as useful context for settings-source thinking, not the final model contract

### [daynest-storage-projection-decision-matrix-v1.md](./daynest/architecture/daynest-storage-projection-decision-matrix-v1.md)

Role:

- active MVP engineering decision matrix

Clarification:

- this document narrows storage, ledger, projection, migration, compatibility, and template-location choices before ADR creation
- it is not an ADR
- it is not runtime implementation approval

## 5. DayNest Historical Checkpoint Documents

### [daynest-daily-agent-design-v1.md](./daynest/checkpoints/daynest-daily-agent-design-v1.md)
### [daynest-daily-agent-design-review-v1.md](./daynest/checkpoints/daynest-daily-agent-design-review-v1.md)
### [daynest-manual-test-command-design-v1.md](./daynest/checkpoints/daynest-manual-test-command-design-v1.md)

Clarification:

- these remain useful for understanding DayNest development history
- they are not current implementation instructions
- some statements were historically correct when written but are now stale

## 6. MoodNest Current Source-Of-Truth Documents

### [moodnest-product-design-v1.md](./moodnest/product/moodnest-product-design-v1.md)

Role:

- primary MoodNest product identity and scope

### [dialogue-tone-guide.md](./moodnest/safety/dialogue-tone-guide.md)

Role:

- primary MoodNest tone and language calibration guide

### [moodnest-support-strategy-map.md](./moodnest/safety/moodnest-support-strategy-map.md)

Role:

- primary MoodNest support-strategy and safety-handling guide

### [moodnest-mini-eval-v1.md](./moodnest/evaluation/moodnest-mini-eval-v1.md)

Role:

- primary MoodNest reply-quality evaluation protocol

### [moodnest-mini-eval-v1.json](./moodnest/evaluation/moodnest-mini-eval-v1.json)

Role:

- machine-readable evaluation artifact companion

## 7. MoodNest Supporting Document

### [moodnest-information-architecture-v1.md](./moodnest/product/moodnest-information-architecture-v1.md)

Clarification:

- this remains useful as a broad structure document
- some task, growth, and game-layer ideas described there are now more clearly owned by DayNest

## 8. Shared Architecture-Support Documents

### [module-map.md](./shared/architecture/module-map.md)
### [startup-chain.md](./shared/architecture/startup-chain.md)
### [bundle-risk.md](./shared/architecture/bundle-risk.md)
### [safe-refactor-plan.md](./shared/architecture/safe-refactor-plan.md)

Clarification:

- these describe repo structure, runtime shape, and refactor history
- they are not product source-of-truth documents
- `startup-chain.md` and `safe-refactor-plan.md` may contain time-sensitive assumptions

## 9. Governance Structure

### [archive/README.md](./archive/README.md)

Role:

- archive boundary and archive-move rules

### [adr/README.md](./adr/README.md)

Role:

- ADR process, status, and naming entry point

### [adr/ADR-001-task-storage-and-subtask-promotion.md](./adr/ADR-001-task-storage-and-subtask-promotion.md)

Role:

- accepted DayNest task storage and subtask promotion ADR

### [adr/ADR-002-daynest-task-canonical-persistence-format.md](./adr/ADR-002-daynest-task-canonical-persistence-format.md)

Role:

- proposed DayNest task canonical persistence format ADR

## 10. Conflict-Resolution Rules

- newer source-of-truth docs override older milestone-era assumptions
- historical docs are context, not implementation instructions
- neutral internal identifiers override visible narrative labels in data models
- template rendering remains presentation-only
- Markdown projection is not the only canonical truth
- charts consume canonical records and ledgers
- MoodNest raw chats remain isolated

## 11. Current Unresolved Decisions

- JSONL ledger prototype result
- promoted-subtask UX
- managed-block marker design
- linked-note backlink behavior
- custom vault template-file UX
- dashboard cache location
- schema migration workflow
- narrative-label customization
- game-layer visibility controls

## 12. Workflow And Runtime Checkpoint

- Workflow-0 Codex review-bundle tooling is complete
- Docs-4B governance-entry metadata rollout is complete
- Docs-5 archive and ADR structure is complete
- no files were archived in this batch
- ADR-001 is accepted
- ADR-002A proposed draft is active
- runtime remains intentionally narrow:
  - manual dev-only `append_daily_log` path only
  - no Daily Agent runtime yet
  - no DayNest settings UI yet
  - no DayNest dashboard yet
  - no task / expense / timer execution yet
- task-domain isolated foundations now exist:
  - task types
  - draft boundary
  - draft-to-record adapter
  - repository contract bridge
  - flat checkbox projection helper
- no task repository implementation yet
- no task executor yet
- no task-writing runtime path yet
- runtime implementation remains paused pending ADR-002 acceptance

## 13. Next Recommended Artifact

Current documentation phase:

- `ADR-002A`: proposed task canonical persistence format draft

Next architecture step after review:

- `ADR-002`: acceptance or revision

## 14. Future Governance

- create ADR files only after the `docs/adr/` structure exists
- do not delete historical docs before archival links are stable
