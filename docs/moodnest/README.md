---
status: active-supporting
scope: moodnest-documentation-entry
last-reviewed-checkpoint: docs-4b-3c
supersedes: []
superseded-by: []
---

# MoodNest Documentation

## MoodNest Identity

- MoodNest is the emotional-support assistant
- its responsibilities include:
  - support identity
  - reply tone
  - safety handling
  - low-energy support
  - evaluation standards

## Current Source-Of-Truth Documents

### [moodnest-product-design-v1.md](./product/moodnest-product-design-v1.md)

Role:

- primary MoodNest product identity and scope

Answers:

- what MoodNest is
- what MoodNest should prioritize
- what product boundaries should remain stable

### [dialogue-tone-guide.md](./safety/dialogue-tone-guide.md)

Role:

- primary MoodNest tone and language calibration guide

Answers:

- how replies should sound
- what phrasing to avoid
- how to preserve the support identity in conversation

### [moodnest-support-strategy-map.md](./safety/moodnest-support-strategy-map.md)

Role:

- primary MoodNest support-strategy and safety-handling guide

Answers:

- how support scenes should be handled
- where risk boundaries sit
- how support strategy should stay aligned with product identity

### [moodnest-mini-eval-v1.md](./evaluation/moodnest-mini-eval-v1.md)

Role:

- primary MoodNest reply-quality evaluation protocol

Answers:

- how MoodNest responses are evaluated
- what quality dimensions matter
- how manual review should be framed

### [moodnest-mini-eval-v1.json](./evaluation/moodnest-mini-eval-v1.json)

Role:

- machine-readable evaluation artifact companion

Answers:

- what structured evaluation cases back the markdown protocol
- what machine-readable evaluation payload currently exists

## Supporting Document

### [moodnest-information-architecture-v1.md](./product/moodnest-information-architecture-v1.md)

Clarification:

- some older task, growth, and game-layer ideas are now more clearly owned by DayNest

## Shared Architecture Support

### [module-map.md](../shared/architecture/module-map.md)
### [startup-chain.md](../shared/architecture/startup-chain.md)
### [bundle-risk.md](../shared/architecture/bundle-risk.md)
### [safe-refactor-plan.md](../shared/architecture/safe-refactor-plan.md)

Clarification:

- shared architecture docs support implementation understanding
- they are not MoodNest product source-of-truth documents

## Boundary Rule

- do not add DayNest productivity logic into MoodNest support-policy files
- raw MoodNest chat must not silently flow into DayNest
- cross-module summaries belong to future NestHub and require explicit approval
