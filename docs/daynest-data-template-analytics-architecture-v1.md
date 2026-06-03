# DayNest Data, Template, And Analytics Architecture v1

## 1. Architecture Objective

This document defines a conservative architecture direction for how DayNest should:

- store canonical data
- produce user-facing Markdown projections
- render templates safely
- derive analytics read models
- keep caches rebuildable

This is a documentation-only design step.

Core objective:

- separate canonical data, user-facing projections, template rendering, analytics, and caches into clear layers
- preserve local-first ownership, inspectability, and auditability

Confirmed boundaries:

- existing MoodNest behavior must remain unchanged
- no runtime implementation is approved by this document
- DayNest remains local-first by default
- Markdown remains an important user-facing surface, but not the only source of truth

## 2. Layer Model

Recommended architecture layers:

1. canonical mutable domain records
2. append-only or audit-friendly ledgers
3. template rendering layer
4. Markdown projections
5. analytics read models
6. rebuildable caches

Design rule:

- each layer has one clear responsibility
- later layers may read earlier layers
- earlier layers must not depend on projections or charts to remain valid

## 3. Canonical Mutable Domain Records

These are the current state records the user can edit, inspect, or migrate.

Recommended categories:

- tasks
- projects
- milestones
- habits
- habit options
- rewards
- summaries
- narrative-label settings
- template settings

Suggested characteristics:

- represent latest user-visible state
- support updates over time
- remain understandable outside of the plugin as much as possible

Examples:

- a task record tracks the current title, status, hierarchy links, schedule fields, and reward metadata
- a reward record tracks current cost, repeatability, active state, and optional image reference
- a template settings record tracks current selected template mode, language, and user overrides

Recommended rule:

- canonical mutable records store present state
- historical audit belongs in ledgers or explicit revision history, not in ad hoc duplicated state fields

## 4. Append-Only Or Audit-Friendly Ledgers

These records explain what happened over time.

Recommended ledger categories:

- action events
- timer sessions
- habit check-ins
- progress XP transactions
- attribute XP transactions
- reward-token transactions
- reward redemptions
- optional wellbeing observations

Recommended shared ledger fields:

- `ruleVersion`
- `sourceId`
- `occurredAt`
- adjustment history reference or adjustment reason
- anti-double-counting identifiers

Field intent:

- `ruleVersion`
  - records which reward or settlement rule version produced an event
- `sourceId`
  - links a transaction to the originating record or evidence source
- `occurredAt`
  - records the effective event time
- adjustment history
  - preserves why a correction or override was made
- anti-double-counting identifiers
  - prevent the same evidence from minting duplicate rewards through reprocessing

Recommended design rule:

- ledgers should be append-friendly
- corrections should normally be modeled as explicit adjustment entries rather than silent destructive rewrites

## 5. Reward-Token Balance

Reward balance must be derived.

Recommended rule:

- `rewardBalance` is computed from reward-token transactions
- never store the displayed balance as the only source of truth

Recommended transaction categories:

- earn
- spend
- adjustment

Why this matters:

- balances stay auditable
- mistakes can be corrected without losing history
- monthly settlement remains reproducible

Important separation:

- real expense records remain distinct from virtual reward-token records
- DayNest should never reuse real-world currency structures as the canonical representation of virtual rewards

## 6. Markdown Projections

Markdown projections are user-facing views generated from canonical data and ledgers.

Recommended projection types:

- daily notes
- task checkbox projections
- long-task progress blocks
- reward-redemption notes
- monthly settlement summaries
- linked-note references

Projection rule:

- projections are inspectable and user-facing
- projections are not the only canonical source of truth

Implication:

- if a projection is deleted or becomes stale, it should be rebuildable from canonical records and ledgers where practical

## 7. Template-System Responsibilities

Templates convert structured data into Markdown.

Templates should:

- accept structured input
- render stable Markdown output
- support visible language and narrative labels

Templates must not:

- calculate rewards
- mutate canonical data
- generate chart data
- read vault files
- write vault files
- call Agent or LLM

Recommended mental model:

- templates are presentation logic only

## 8. Template Kinds

Suggested future template kinds:

- `daily_log_entry`
- `daily_note_shell`
- `linked_note_reference`
- `task_entry`
- `task_checkbox`
- `long_task_progress`
- `habit_checkin_entry`
- `timer_entry`
- `effort_settlement`
- `monthly_growth_report`
- `reward_redemption`
- `wishlist_item`
- `wellbeing_observation_summary`

Recommendation:

- each template kind should have its own narrow render contract
- do not let one generic template context become a catch-all object bag

## 9. Safe Render Context

Templates should render from explicit, allowlisted context only.

Recommended rules:

- per-template-kind variable allowlists
- support scalar values
- support list values
- inject localized labels through safe explicit fields
- render once only
- no recursive interpolation
- preserve unknown variables literally
- return warnings when unknown variables are present
- no arbitrary object traversal
- no arbitrary vault reads

Suggested render contract behavior:

- known variable -> deterministic replacement
- missing optional value -> empty string
- unknown variable -> preserved in output plus warning

Reason:

- this keeps templates safe, debuggable, and predictable

## 10. Narrative Labels

Internal fields must remain neutral even when the visible language is narrative-heavy.

Recommended internal identifiers:

- `progressXp`
- `attributeXp`
- `rewardToken`
- `rewardBalance`
- `rewardTransaction`
- `rewardLedger`
- `rewardCatalog`
- `rewardRedemption`
- `restMode`
- `pauseWindow`
- `monthlySettlement`

Chinese visible labels should live in localization or a label registry later, for example:

- `成长值`
- `成长方向`
- `微光`
- `提灯`
- `微光记录`
- `心愿单`
- `心愿卡`
- `点亮心愿`
- `歇脚模式`
- `停靠日`
- `沿途回望`

Rule:

- narrative labels belong to the presentation layer
- neutral identifiers belong to the domain layer

## 11. Analytics Architecture

Charts and analytics should consume canonical records and ledgers, never rendered Markdown alone.

Recommended aggregators:

- completed tasks by day and week
- long-task progress
- focus minutes by day, project, and tag
- habit check-in calendar
- habit contribution
- progress XP by period and source
- reward-token income, spending, and adjustment
- wishlist affordability and progress
- attribute XP by month
- monthly settlement
- optional wellbeing trends
- Agent recommendation-to-completion conversion

Analytics rule:

- if an analytic cannot be derived from canonical records or ledgers, it should not depend on Markdown text scraping as its primary architecture

## 12. Read Models And Caches

Recommended read models:

- dashboard daily summary
- weekly aggregate
- monthly aggregate

Cache rules:

- cache can be deleted and rebuilt
- cache is never canonical truth

Candidate cache locations:

- inside the vault
- inside plugin data

Trade-off discussion:

- vault cache
  - user-visible and inspectable
  - but may create clutter
- plugin-data cache
  - cleaner vault experience
  - but less directly inspectable

Conservative recommendation:

- prefer caches that are clearly marked as disposable
- avoid mixing caches with user-authored notes unless there is a strong reason

## 13. Suggested Vault Layout

Suggested future layout:

- `daily/`
- `tasks/`
- `projects/`
- `habits/`
- `rewards/`
- `templates/`
- `summaries/`
- `data/action-events/`
- `data/timer-sessions/`
- `data/habit-checkins/`
- `data/progress-xp/`
- `data/attribute-xp/`
- `data/reward-tokens/`
- `data/reward-redemptions/`
- `data/wellbeing-observations/`
- `data/cache/`

Direction:

- user-facing records live in understandable top-level areas
- raw event and ledger data lives under `data/`
- cache stays clearly non-canonical

## 14. Storage-Format Options

This batch does not approve implementation, but it should frame the trade-offs.

### Option A: Markdown plus YAML Properties for mutable entities

Best suited for:

- tasks
- projects
- habits
- rewards
- summaries

Benefits:

- user-readable
- Obsidian-friendly
- compatible with Properties and potentially Bases

Trade-offs:

- mutable edits are less event-like
- large-scale aggregation may need extra indexing

### Option B: Monthly JSONL ledgers for append-friendly events

Candidate fit:

- action events
- timer sessions
- habit check-ins
- XP transactions
- reward-token transactions

Benefits:

- append-friendly
- replay-friendly
- simpler event ingestion

Trade-offs:

- less human-friendly than Markdown
- needs careful schema discipline

### Option C: JSON sidecar files

Benefits:

- structured and explicit
- easier machine parsing

Trade-offs:

- less native-feeling in Obsidian
- may increase file sprawl

### Option D: Plugin data for internal settings and optional cache

Candidate fit:

- internal settings state
- ephemeral read models
- rebuildable caches

Benefits:

- cleaner vault surface
- implementation flexibility

Trade-offs:

- less transparent to the user
- weaker local inspectability than vault files

Conservative recommendation:

- prefer human-readable vault-native formats for user-owned canonical records
- consider append-friendly structured formats for ledgers
- keep internal cache and derived-only state separate from canonical user content

## 15. Compatibility

Future compatibility targets may include:

- Obsidian Properties
- Obsidian Bases
- optional Dataview compatibility
- optional Obsidian Tasks-compatible projection
- optional Obsidian Daily Notes import
- optional Obsidian CLI adapter later

Recommended rule:

- avoid hard dependencies in MVP
- prefer optional compatibility layers over core architectural coupling

## 16. Schema Evolution

Future data evolution should be planned early even if implementation is delayed.

Recommended version markers:

- `schemaVersion`
- template version
- reward-rule version

Recommended evolution topics:

- migration strategy
- ledger replay or rebuild strategy
- compatibility with old projections
- user-visible migration safeguards

Suggested rule:

- old data should remain explainable
- projections may be regenerated
- ledgers should be replayable or at least auditable enough to rebuild derived state

## 17. Privacy Boundaries

Important boundaries:

- MoodNest raw chat remains isolated
- Wellbeing Tracker remains opt-in and privacy-separated
- cross-module summaries require explicit approval
- narrative language never overrides safety-sensitive language

Recommended principle:

- convenience must not erase data boundaries

## 18. MVP Boundaries

What should come first:

- minimal canonical record strategy
- minimal ledger strategy for effort and reward evidence
- safe template renderer
- a small set of Markdown projections
- basic analytics derived from canonical data

What remains documentation-only for now:

- full analytics suite
- schema migration engine
- broad compatibility adapters
- advanced template systems
- wellbeing-specific storage

What is explicitly delayed:

- runtime implementation of full storage architecture
- settings persistence design decisions
- settings UI
- advanced cache invalidation logic

## 19. Open Questions

- JSONL versus other ledger formats
- one-file-per-task versus grouped task index
- whether custom templates live in settings or vault files
- whether limited Mustache-style sections are supported later
- whether linked notes write backlinks automatically
- cache location
- user-customizable narrative labels
- how much of the narrative layer can be disabled
- how template versions and schema migrations interact

## 20. Conservative Conclusion

Recommended future direction:

- keep canonical data, projections, rendering, analytics, and caches clearly separated
- treat Markdown as an important user-facing layer, not the only source of truth
- keep reward balances and analytics derived from ledgers
- keep templates pure and deterministic
- keep caches disposable
- preserve local-first ownership and inspectability throughout

No runtime changes are approved by this document.
