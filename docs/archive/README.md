---
status: active-supporting
scope: documentation-archive-entry
last-reviewed-checkpoint: docs-5
supersedes: []
superseded-by: []
---

# Documentation Archive

## Purpose

This file defines the archive boundary for historical documentation.

`docs/archive/` is for retained history, not active implementation guidance.

## What Belongs In `docs/archive/`

- superseded design drafts
- historical checkpoints
- migration notes that are no longer active instructions
- prior planning documents retained for traceability

## What Must Not Be Archived

- current source-of-truth docs
- active ADRs
- `docs/INDEX.md`
- `docs/CURRENT.md`
- active module `README.md` files

## Archive Rules

- archive does not mean delete
- archived docs remain readable for history and auditability
- archived docs must not be treated as current implementation instructions
- move docs only in a dedicated migration batch
- update links and navigation when files are moved
- do not silently archive files during unrelated feature work

## Navigation Rule

- `docs/INDEX.md` remains the main documentation entry point
- `docs/CURRENT.md` remains the current-phase checkpoint
- archive docs should be reached through explicit links when still relevant

Do not move existing documents into `docs/archive/` outside an explicit docs-only migration batch.
