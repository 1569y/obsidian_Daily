# DayNest Documentation

## DayNest Identity

- DayNest is the action and local-first personal-growth ledger
- current Chinese-first narrative theme:
  - 一路微光
- visible terminology includes:
  - 成长值
  - 成长方向
  - 微光
  - 提灯
  - 心愿单
  - 心愿卡
  - 心愿驿站
  - 点亮心愿
  - 歇脚模式
  - 停靠日
  - 沿途回望

## Current Source-Of-Truth Documents

### [daynest-growth-economy-domain-design-v1.md](./product/daynest-growth-economy-domain-design-v1.md)

Role:

- primary DayNest product and domain direction

Answers:

- what DayNest is becoming
- how tasks, habits, timers, rewards, and optional wellbeing fit together
- what DayNest should and should not reward

### [daynest-data-template-analytics-architecture-v1.md](./architecture/daynest-data-template-analytics-architecture-v1.md)

Role:

- primary DayNest data, projection, template, analytics, and cache architecture guide

Answers:

- what is canonical data
- what is a ledger
- what is a Markdown projection
- how analytics should be derived
- how caches are treated

### [daynest-daily-note-template-language-design-v1.md](./settings/daynest-daily-note-template-language-design-v1.md)

Role:

- primary DayNest daily-note integration and template-safety guide

Answers:

- daily-note integration modes
- daily-note and template settings direction
- built-in language direction
- template safety boundaries

## Supporting Documents

### [daynest-narrative-language-design-v1.md](./narrative/daynest-narrative-language-design-v1.md)

Clarification:

- narrative-language design defines visible wording and tone

### [daynest-daily-note-user-settings-v1.md](./settings/daynest-daily-note-user-settings-v1.md)

Clarification:

- the daily-note user-settings document is partially superseded

### [daynest-storage-projection-decision-matrix-v1.md](./architecture/daynest-storage-projection-decision-matrix-v1.md)

Clarification:

- the decision matrix narrows MVP storage and projection choices before ADRs

## Historical Checkpoints

### [daynest-daily-agent-design-v1.md](./checkpoints/daynest-daily-agent-design-v1.md)
### [daynest-daily-agent-design-review-v1.md](./checkpoints/daynest-daily-agent-design-review-v1.md)
### [daynest-manual-test-command-design-v1.md](./checkpoints/daynest-manual-test-command-design-v1.md)

Clarification:

- useful for development history
- not current implementation instructions

## Validated Runtime Checkpoint

- manual dev-only `append_daily_log` path only
- no DayNest Agent runtime yet
- no DayNest settings UI yet
- no DayNest dashboard yet

## Current Pending Decisions

- ADR-001: top-level task storage and subtask promotion model
- ledger format prototype before ADR-002
- projection marker design before managed blocks
- linked-note backlink behavior
- template-file UX later

## Boundary Rule

- do not mix DayNest growth-ledger logic into MoodNest support-policy files
