# DayNest Growth Economy And Domain Design v1

## 1. Purpose

This document defines a future-facing product and domain-model direction for DayNest as it expands beyond a daily-note helper.

This is a documentation-only design step.

Confirmed boundaries:

- existing MoodNest behavior must remain unchanged
- no runtime implementation is approved by this document
- DayNest should remain local-first by default
- DayNest should support action and motivation without becoming a pressure system
- any future Agent participation must remain confirm-before-write

## 2. Product Identity

### DayNest as a local-first personal growth ledger

DayNest should evolve into a local-first personal growth ledger that helps users:

- capture meaningful actions
- track progress over time
- accumulate evidence of effort
- reflect on growth without turning life into a harsh scoreboard

Local-first means:

- canonical user records live in the local vault by default
- the user can inspect, back up, and delete their own records
- DayNest should not require cloud-only state to remain usable

### Relationship to MoodNest and future NestHub

Recommended relationship:

- MoodNest
  - emotional support and reflective conversation
- DayNest
  - action, progress, routines, effort evidence, and reward economy
- NestHub
  - future umbrella surface that may connect multiple modules without collapsing their identities

Boundary rule:

- DayNest should not inherit MoodNest's emotional support identity as its default product voice
- MoodNest should not silently expose raw chats to DayNest
- any future cross-module insight should be explicit, minimal, and user-controlled

### Action without pressure

DayNest should help users move, notice, and recover.

It should not default to:

- shame-driven streak loss
- punitive missed-task scoring
- aggressive gamification
- hidden reward calculations
- automatic declarations that the user has "failed"

Recommended tone and system design:

- reward effort, not perfection
- support pauses and rest
- allow incomplete progress to still count as evidence
- keep recovery paths simple after interruptions

## 3. Core Design Principles

- local-first canonical records
- append-friendly audit trails where appropriate
- deterministic reward rules
- explicit confirmation before meaningful writes or completions
- user-understandable scoring and settlement
- reversible, inspectable projections into Markdown
- optionality for more sensitive features
- low-pressure defaults

## 4. Task Hierarchy

DayNest should support a hierarchical task model that can represent both small next actions and long-horizon work.

### Task layers

- project
  - broad container for related work
- milestone
  - major checkpoint inside a project
- task
  - standard actionable unit
- subtask
  - smaller actionable unit under a task or milestone

### Time horizon types

Suggested task cadence type:

- `one_off`
- `long_horizon`
- `recurring`

Intent:

- `one_off`
  - finite work item with a normal completion boundary
- `long_horizon`
  - progress-oriented work that may run for weeks or months
- `recurring`
  - task-like activity that repeats on a schedule but is not modeled as a full habit

### Scheduling fields

Suggested scheduling fields:

- `startsAt`
- `dueAt`
- `showInTodayFrom`
- `pinUntilDone`

Field intent:

- `startsAt`
  - the earliest date/time the task is considered active
- `dueAt`
  - the intended deadline or target completion point
- `showInTodayFrom`
  - when the task should begin surfacing in "today" views even before it is due
- `pinUntilDone`
  - whether the task should remain prominently surfaced until completion or explicit unpin

### Weighted subtasks

Subtasks should support weighted contribution so that large tasks are not forced into equal-sized child units.

Suggested idea:

- each subtask may carry a weight value
- parent progress can be derived from completed weight over total weight

Benefits:

- more realistic long-task progress
- less distortion when one child task is much larger than another

### Parent completion bonus

A parent task or milestone may later grant a completion bonus when all required children are complete.

Rule:

- the bonus must be explicit in the reward rules
- the bonus must be granted once per parent completion event

### Prevent reward double-counting

Task hierarchy must avoid accidental reward inflation.

Recommended anti-double-counting rule:

- child completion can grant child-level rewards
- parent progress can reflect child evidence
- parent completion bonus, if enabled, should be a separately defined bonus
- parent completion should not re-award the full sum of all child rewards unless rules explicitly say so

This keeps:

- evidence counting clear
- settlement auditable
- reward stacking understandable

## 5. Habit System

DayNest should support flexible habits without forcing all routines into a rigid single-action streak model.

### Habit group and options

Suggested structure:

- habit group
  - parent routine category
- habit options or child habits
  - concrete ways to satisfy that routine

Example:

- exercise
  - jump rope
  - running
  - walking
  - yoga

This allows one intention to map to several acceptable forms.

### Completion rules

Suggested rule types:

- `any_of`
- `all_of`
- `count_at_least`
- `duration_at_least`

Intent:

- `any_of`
  - any one allowed option satisfies the check-in
- `all_of`
  - all required options must be completed
- `count_at_least`
  - complete at least N child actions or repetitions
- `duration_at_least`
  - reach at least a target time threshold

### Recurring schedules

Habits should support recurring schedules such as:

- daily
- weekdays
- selected weekdays
- every N days
- weekly target counts

Conservative note:

- schedule complexity should grow slowly
- MVP should favor understandable recurrence over exhaustive recurrence logic

### Streaks

Streak should be treated as a continuity signal, not as the whole value of the system.

Streak should help answer:

- how consistently the user has stayed in contact with the habit

Streak should not imply:

- moral worth
- irreversible loss
- the only source of motivation

### Pause and recovery behavior

Habits need explicit pause and recovery behavior.

Suggested future behavior:

- allow pause windows for illness, travel, overload, or intentional rest
- paused periods should not silently count as missed failures
- recovery after interruption should be lightweight

### Avoid punitive defaults

Recommended defaults:

- no automatic negative scoring
- no public shame mechanics
- no harsh reset messages
- missed activity can reduce continuity, but should not erase overall growth evidence

## 6. Timer System

Timers should act as structured evidence of effort, not as silent completion engines.

### Supported timer modes

- stopwatch
- pomodoro
- countdown

### Suggested timer fields

- `linkedTaskId`
- `linkedHabitId`
- `projectId`
- `elapsedMs`

Purpose:

- connect effort sessions to broader work contexts
- support later analytics and reward logic

### Timer sessions as evidence of effort

A finished or stopped timer session should be treated as evidence that effort occurred.

This can support:

- effort XP
- project focus totals
- habit duration thresholds
- later suggestions about progress

### Timer rewards and daily caps

Timer-linked rewards may exist later, but they need guardrails.

Recommended rule direction:

- reward meaningful effort intervals
- define daily caps to avoid farmable infinite rewards
- make caps visible in rule descriptions

### No automatic task completion without confirmation

A timer finishing should never silently mark a task done.

Allowed future behavior:

- suggest completion
- suggest progress update
- suggest break logging

Required boundary:

- user confirms before task completion is written

## 7. Growth Economy

DayNest may include a layered growth economy, but the layers should remain conceptually distinct.

### Economy layers

- Effort XP
  - non-spendable total effort signal
- Attribute XP
  - non-spendable growth signal by category
- Growth Coin
  - spendable virtual reward currency
- Streak
  - continuity signal rather than spendable value

### Why real expense currency and virtual reward currency must remain separate

This separation is important because they answer different questions.

- real expense currency
  - what the user actually spent in life
- virtual reward currency
  - what the user has earned inside the motivation system

If they are mixed:

- accounting becomes confusing
- reward meaning becomes unstable
- analytics become misleading
- there is risk of users treating virtual rewards like real purchasing state

Recommended rule:

- never reuse real expense ledger fields for virtual reward balances
- keep transaction categories and units distinct

### Transaction-ledger design

Growth Coin, Effort XP, and Attribute XP should each be derivable from transactions or evidence-backed award events.

Suggested ledger philosophy:

- append-only or audit-friendly transaction/event history
- derived balances and totals
- explicit sources for each award or deduction

### Balance derived from transactions

Spendable currency balances should be derived from transactions, not from a mutable single source of truth that loses history.

This supports:

- auditability
- correction history
- safer recomputation
- trust in totals

### Adjustments and audit history

The system should allow future manual adjustments, but adjustments must remain visible.

Adjustment examples:

- correcting an accidental double award
- compensating for a migration issue
- granting a one-time manual bonus

Every adjustment should keep:

- timestamp
- actor/source
- reason
- ruleVersion

### ruleVersion

Reward-producing records should carry a `ruleVersion` so the system can explain which rule set produced which totals.

This becomes important when:

- reward rules change over time
- old records need historical interpretation
- monthly settlement summaries need reproducibility

### Anti-double-counting rules

Recommended future rule set:

- one evidence event should map to rewards once per relevant ledger
- a timer session should not repeatedly mint the same reward through recomputation
- a task completion should not grant multiple identical awards unless rules explicitly allow stacked categories
- parent/child bonus stacking should be explicit and limited

## 8. Reward Wishlist

DayNest may include a reward wishlist that turns earned virtual currency into self-defined rewards.

### Reward catalog

Suggested model:

- reward catalog
  - the set of reward definitions the user maintains
- personal rewards
  - user-authored reward entries such as:
  - favorite snack
  - guilt-free rest evening
  - buy a small item
  - watch a movie

### Repeatable versus one-time rewards

Rewards should support:

- repeatable rewards
- one-time rewards

Intent:

- repeatable
  - can be redeemed multiple times
- one-time
  - can be redeemed only once unless explicitly re-enabled

### Redemption confirmation

Reward redemption should require explicit user confirmation.

This prevents:

- accidental spending
- ambiguous auto-redemption
- silent balance changes

### costSnapshot

A redemption record should carry a `costSnapshot`.

Reason:

- reward costs may later change
- historical redemptions should remain explainable using the cost at redemption time

### Reward redemption ledger

Reward redemption should be recorded in its own ledger or transaction stream.

This supports:

- derived balance integrity
- audit history
- monthly summaries

### Wishlist progress

The system may show wishlist progress as:

- coins earned toward a target reward
- reward affordability state
- recent progress velocity

### Optional images

Rewards may later support optional images or thumbnails.

MVP rule:

- optional visual enhancement only
- no dependency on image presence for core logic

### Avoid linking to real purchasing or payment flows in MVP

Important boundary:

- reward redemption is a self-tracking action
- it is not a purchase engine
- MVP should not integrate checkout, payment, or shopping flows

## 9. Growth Attributes

Growth attributes can help users see where effort is accumulating, without pretending all growth is one-dimensional.

### Configurable attribute definitions

Suggested model:

- attribute definitions are configurable
- users may opt into the attributes they care about

### Optional default attribute presets

Suggested defaults may include:

- health
- learning
- work
- creativity
- life
- mood

These should be presets, not mandatory truth categories.

### Attribute XP transactions

Attribute XP should be derived from explicit transactions or award events tied to evidence.

This allows:

- auditability
- custom categories
- reclassification in later rule versions if needed

### Monthly settlement

Monthly settlement can summarize:

- attribute XP earned
- strongest growth area
- trends versus prior months

Settlement should summarize prior evidence.

It should not become the only place where evidence exists.

### Opt-in customization

Users should be able to:

- keep default attributes
- customize names and active categories later
- disable the attribute layer entirely if it feels unhelpful

## 10. Calendar And Settlement

DayNest should make long-term effort legible through low-pressure visual summaries.

### Daily action calendar

Useful for:

- seeing active versus quiet days
- browsing daily evidence entries

### Habit heatmap

Useful for:

- consistency patterns
- recovery after gaps

### Task timeline

Useful for:

- start-to-due visibility
- long-task progress windows

### Monthly growth report

A monthly growth report may summarize:

- effort source breakdown
- earned coins
- redeemed rewards
- strongest growth attribute
- longest-running habit
- longest focus project

Settlement principle:

- summarize
- do not judge
- show evidence and patterns more than moral scoring

## 11. Optional Relief Toolkit

DayNest may later include a low-pressure relief toolkit, but this should remain clearly bounded.

Possible tools:

- reflection card deck
- answer-book-style random prompt
- worry-box timer
- low-pressure next-step suggestions

Safety positioning:

- suitable only for low-stakes reflection
- never present random prompts as authoritative advice
- do not use for medical, legal, financial, or other high-stakes decisions

Open module question:

- decide later whether this belongs in MoodNest, DayNest, or a shared NestHub area

## 12. Optional Wellbeing Tracker

DayNest may later include an optional wellbeing tracker, but this feature should be treated as sensitive and strictly opt-in.

### Observation types

Suggested examples:

- pain
- sleep
- energy
- mood
- symptom
- medication
- custom

### Observation fields

- timeline and calendar visualization
- severity
- duration
- triggers
- interventions
- effectiveness
- notes

### Privacy and safety rules

- local-only by default
- opt-in only
- no medical diagnosis
- no default gamification
- no default Agent sharing
- strict privacy separation

Recommended separation rule:

- wellbeing observations should not automatically feed reward systems
- wellbeing observations should not be silently surfaced to MoodNest or agents

## 13. Agent Boundary

Future Agent participation must remain bounded and subordinate to user confirmation.

### What the Agent may do

- propose action drafts
- suggest classification
- suggest linkages between records
- suggest next steps based on deterministic evidence

### What the user must confirm before write

- completion
- ledger writes
- rewards
- settings changes

### Deterministic evidence that may support suggestions

- timer completed
- checkbox manually selected
- explicit user statement

### Forbidden silent behaviors

- no silent task completion
- no silent coin awards
- no silent settings changes
- no silent access to MoodNest raw chats

## 14. Canonical Data Categories

DayNest should separate canonical records, append-only ledgers, Markdown projections, and rebuildable caches.

### Mutable domain records

- tasks
- projects
- habits
- rewards
- summaries

### Append-only ledgers

- action events
- timer sessions
- habit check-ins
- effort XP
- attribute XP
- growth coins
- reward redemptions
- wellbeing observations

### Markdown projections

- daily notes
- task checkbox projections
- monthly summaries
- linked notes

### Rebuildable caches

- dashboards
- charts
- monthly aggregates

Recommended rule:

- projections are not canonical truth
- caches must be disposable and rebuildable

## 15. Template Implications

Templates should remain presentation-only.

They must not become:

- reward calculators
- canonical storage
- chart data sources

Future template kinds may include:

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

Template boundary:

- templates render existing data
- templates do not determine reward outcomes
- templates do not become business logic

## 16. Analytics Ideas

Possible future analytics:

- task completion trend
- effort source distribution
- focus minutes by project
- long-task progress
- habit streak calendar
- habit contribution
- coin income and redemption
- wishlist progress
- attribute XP by month
- optional wellbeing trends
- Agent recommendation-to-completion conversion

Analytics rule:

- derived from canonical records and ledgers
- never treat Markdown text alone as the source of truth

## 17. MVP And Later Phases

### MVP

Recommended first broad functional scope:

- tasks
- subtasks
- long-horizon tasks
- habits
- simple timers
- growth coins
- wishlist
- calendar
- basic statistics

### Later

Suggested later phases:

- growth attributes
- settlement
- achievements
- Agent extraction
- relief toolkit
- wellbeing tracker
- NestHub cross-module insights

### Conservative sequencing note

Recommended order of risk:

1. core task and habit records
2. timer evidence
3. reward ledger basics
4. calendar and analytics
5. attribute and settlement layers
6. optional sensitive or playful extensions

## 18. Open Questions

- naming of the spendable virtual currency
- whether effort XP and growth coin awards share the same rules
- whether parent and child task awards can stack
- timer reward daily caps
- habit pause and recovery behavior
- custom growth attributes
- whether reward redemption is manual-only
- JSONL versus other ledger storage formats
- whether Wellbeing Tracker belongs in DayNest or a separate module
- how much of the game layer users can disable

## 19. Conservative Conclusion

Recommended future direction:

- define DayNest as a local-first personal growth ledger
- separate evidence, rewards, projections, and analytics clearly
- keep reward rules auditable and non-punitive
- require confirmation before completions, ledger writes, rewards, or settings changes
- keep sensitive wellbeing features opt-in and privacy-separated
- keep MoodNest and DayNest identities distinct even if NestHub later connects them

No runtime changes are approved by this document.
