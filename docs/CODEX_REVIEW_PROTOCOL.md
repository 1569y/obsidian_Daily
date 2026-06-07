# Codex Review Protocol

## Purpose

Codex self-reports are useful context, but they are not sufficient review evidence by themselves.
Git evidence bundles are the review source of truth.
Do not rely on VS Code red/green rendering alone when deciding whether a batch is safe.

## Required Clean-Worktree Rule

Before a new batch:

1. run `git status --short --untracked-files=all`
2. stop if unexpected prior changes exist
3. do not silently mix batches

## Review Modes

`pre-commit`

- inspect staged changes before commit
- use when the review target is the current staged batch
- actual pre-commit reviews require a non-empty staged diff
- smoke tests may pass `-AllowEmptyDiff`
- normal reviews require no unstaged or untracked residue
- normal review must leave no post-build worktree residue
- `-AllowDirtyWorktree` is exceptional and should not be used during normal batch review

`post-commit`

- inspect already committed changes by SHA
- use when the review target is a completed commit or commit range
- multi-commit arguments must be oldest-to-newest on one ancestor chain
- post-commit reviews should pass `AllowedPaths` when expected scope is known
- `AllowedPaths` may be omitted for exploratory retrospective inspection

## Risk Levels

`L0 docs-only`

- `review-summary.txt` is usually enough for a quick pass
- `changes.patch` is still required for pre-commit review
- no extra runtime tests are usually needed beyond the batch build

`L1 types / pure helpers`

- `review-summary.txt` alone is not enough
- `changes.patch` is required
- include relevant typecheck, unit, or focused helper validation when available

`L2 runtime wiring / storage / settings`

- `review-summary.txt` alone is not enough
- `changes.patch` is required
- include targeted manual test notes or focused runtime verification artifacts

`L3 Agent / LLM / fallback / migrations`

- `review-summary.txt` alone is not enough
- `changes.patch` is required
- include focused tests, manual validation notes, and any migration or fallback risk evidence

## Standard Workflow

1. start from a clean worktree
2. modify only allowed paths
3. stage only explicit paths
4. for small batches, prefer explicit file paths in `AllowedPaths`
5. use wildcards only for intentionally approved directory scopes
6. export a review bundle
7. inspect the evidence
8. commit only after review
9. confirm the worktree is clean again after commit

`-Batch` is a stable workflow-step label and must not contain path-traversal segments.
The exporter resolves the Git repository root automatically before running Git checks or the build command.
The exporter makes each bundle directory unique by combining a local timestamp, the batch label, and the review mode.
If a fully resolved bundle directory unexpectedly already exists, the exporter refuses to overwrite it.
Generated folder format: `yyyyMMdd-HHmmss-fff__<batch>__<mode>`.
Example: `20260607-214530-482__docs-4b-4__pre-commit`.

## Commit Message Rule

Use stage-aware commit messages, for example:

- `docs(docs-4b-4): finalize metadata-phase navigation state`
- `docs(shared-arch-refresh-plan): add architecture refresh plan`
- `docs(docs-5): create archive and ADR structure`
- `docs(adr-001): record task storage and subtask promotion model`

SHA and changed-file signature remain the real verification source.
Commit messages are navigation aids only.
If duplicate messages exist, inspect candidate SHAs rather than guessing.

## Example Commands

Pre-commit export:

```powershell
.\tools\export-codex-review.ps1 `
  -Batch "docs-5-preflight" `
  -Mode "pre-commit" `
  -AllowedPaths @(
    "docs/CODEX_REVIEW_PROTOCOL.md",
    "tools/export-codex-review.ps1"
  )
```

Post-commit export:

```powershell
.\tools\export-codex-review.ps1 `
  -Batch "docs-4b-retro" `
  -Mode "post-commit" `
  -Commits @("989a427", "5876946")
```

`BuildCommand` is trusted local input and should not be populated from untrusted external text.

## Boundary

Review bundles are generated outside the repository under `$env:TEMP`.
Do not commit generated review bundles.
Do not store patches in the repository unless explicitly requested.
Upload `review-summary.txt` and `changes.patch` from the newest timestamped bundle for pre-commit review.
Post-commit bundles may also contain per-commit patches and `combined.patch`.
