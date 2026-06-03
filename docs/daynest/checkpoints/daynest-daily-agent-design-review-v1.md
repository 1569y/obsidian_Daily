---
status: historical-checkpoint
scope: daynest-early-agent-planning-review
last-reviewed-checkpoint: docs-4b-1
supersedes: []
superseded-by: []
---

# DayNest Daily Agent Design Review v1

## 1. Review Scope

This document is a conservative MVP planning addendum for:

- `docs/daynest-daily-agent-design-v1.md`

Its purpose is to turn the broader DayNest design into a narrower MVP decision checklist.

Confirmed baseline:

- DayNest does not exist in runtime code yet.
- MoodNest behavior must remain unchanged.
- Current provider, model, `apiKey`, prompt, fallback, settings, and UI behavior must not be changed for DayNest MVP planning.
- `src/services/llmClient.ts` may be reused later as shared transport, but should not be refactored again just for MVP planning.

## 2. Approved For MVP

The following parts from design v1 are approved as MVP direction:

- DayNest should be added as a separate assistant path, not mixed into MoodNest live support flow.
- DayNest should focus on structured daily capture first.
- MVP should support only a small set of intents:
  - `capture_task`
  - `capture_expense`
  - `append_daily_log`
  - `clarify_missing_fields`
  - `chat_only`
- MVP storage should be Markdown-first and vault-native.
- MVP should keep DayNest storage separate from MoodNest archive paths.
- MVP should begin with DayNest-only types and storage helpers before any richer UI.
- MVP should use a confirm-before-write interaction for agent-created records.
- MVP should treat UI refresh and aggregation as later work if that reduces risk.

## 3. Postpone From MVP

The following parts from design v1 should be postponed:

- `update_task`
- `complete_task`
- `update_expense`
- `start_timer`
- `stop_timer`
- `summarize_day`
- Daily Hub aggregated dashboard
- Sidebar agent with richer state
- STT reuse
- provider-profile divergence from MoodNest
- Obsidian Tasks compatibility mirroring
- recurring task logic
- advanced timer session management
- analytics, charts, and budget summaries

Reason:

- These add either state mutation complexity, UI coordination complexity, or settings pressure too early.

## 4. Recommended MVP Storage Strategy

### Task storage

Recommendation:

- Use one Markdown file per task under `NestHub/DayNest/tasks/`.
- Use simple frontmatter plus short body notes.
- Keep status values minimal:
  - `inbox`
  - `next`
  - `done`

Reason:

- One-file-per-task is easy to inspect, edit manually, and roll back.

### Expense storage

Recommendation:

- Use one monthly Markdown ledger file under `NestHub/DayNest/expenses/`.
- Append one structured bullet or table row per expense entry.

Reason:

- Expense entries are naturally append-oriented and do not need one file per record for MVP.

### Timer storage

Recommendation:

- Postpone active timer runtime behavior from MVP.
- If a placeholder is needed later, use append-only daily timer logs under `NestHub/DayNest/timers/`.

Reason:

- Mutable running-timer state is easy to get wrong and is not necessary for first MVP value.

### Daily log storage

Recommendation:

- Use one daily Markdown note under `NestHub/DayNest/daily/YYYY-MM-DD.md`.
- Append DayNest-generated entries into a dedicated section rather than rewriting the whole note.

Reason:

- Daily logs are date-based and fit well into stable append-oriented files.

## 5. Should MVP Use Obsidian Tasks-Compatible Markdown Syntax

Recommendation:

- Not in Milestone 1.
- Prefer DayNest-owned plain Markdown structures first.
- Revisit Tasks-compatible syntax only after DayNest storage and confirmation flow are stable.

Reason:

- Tasks-compatible syntax may be useful later, but it adds format constraints before core DayNest write behavior is proven.

## 6. First Three Implementation Milestones With Exact File Groups

These are design suggestions, not approved runtime files yet.

### Milestone 1: Types And Storage Contracts

File groups:

- `src/daynest/core/`
  - `types.ts`
  - `intentSchema.ts`
  - `paths.ts`
- `src/daynest/storage/`
  - `taskStorage.ts`
  - `expenseStorage.ts`
  - `dailyLogStorage.ts`

Goal:

- Define DayNest-only data shapes and vault write/read helpers.

### Milestone 2: Daily Agent MVP Interface

File groups:

- `src/daynest/agent/`
  - `dailyAgent.ts`
  - `dailyAgentPrompts.ts`
  - `dailyAgentParser.ts`
- optional shared use only:
  - existing `src/services/llmClient.ts`
  - existing `src/services/llmProviderProfiles.ts`
  - existing `src/services/llmResponseParsers.ts`

Goal:

- Convert user text into a small DayNest result envelope without touching MoodNest agent behavior.

### Milestone 3: Quick Capture MVP

File groups:

- `src/daynest/ui/`
  - `DayNestQuickCaptureModal.ts`
  - `dayNestCommands.ts`
- supporting integration shell:
  - future minimal `src/daynest/index.ts`

Goal:

- Let users capture a task, expense, or daily log entry with confirm-before-write behavior.

## 7. First MVP User Flow

Recommended first flow:

1. User input
   - User opens DayNest quick capture and enters short natural language such as:
   - `Tomorrow morning send the invoice`
2. Intent parsing
   - DayNest agent classifies the input as `capture_task`
   - It extracts a draft task record
3. Confirmation
   - UI shows a compact confirmation summary before writing
   - Example:
   - title, due date, and status
4. Vault write
   - Only after confirmation, DayNest writes the Markdown record into DayNest storage
5. UI refresh later
   - MVP may simply show success feedback first
   - richer sidebar or hub refresh can be added later

Conservative rule:

- Do not silently auto-write from the model output in MVP.

## 8. Strict Files That Must Not Be Touched During Milestone 1

The following should remain untouched during Milestone 1:

- `src/services/agentService.ts`
- `src/services/apiAgentProvider.ts`
- `src/services/ruleBasedAgentProvider.ts`
- `src/services/moodnestSupportStrategy.ts`
- `src/services/lowEnergyDecisionPolicy.ts`
- `src/services/longTextIntakePolicy.ts`
- `src/services/actionRecommendation.ts`
- `src/ui/modals/EmotionLogModal.ts`
- `src/settings.ts`
- `src/types.ts`
- `main.ts`
- `manifest.json`
- `package.json`

Milestone 1 safety rule:

- If a DayNest design choice seems to require changing one of the files above, that choice should be deferred.

## 9. Open Questions That Must Remain Unresolved For Now

The following should remain open during MVP planning:

- Should DayNest later support an independent active provider profile?
- Should DayNest task files later mirror Obsidian Tasks syntax?
- Should expenses eventually move to JSON sidecars or remain Markdown-native?
- Should timer support exist at all before DayNest task capture is proven useful?
- Should Daily Hub be added before a sidebar, or after quick capture validation?
- Should DayNest allow free chat beyond capture-and-clarify MVP scope?
- How much shared typing should be extracted later versus staying inside `src/daynest/core/`?
- Should DayNest writes later support project-based folders or tags?

## 10. MVP Review Conclusion

Recommended MVP decision:

- Proceed only with additive DayNest types, storage helpers, and a small quick-capture flow.
- Do not couple DayNest MVP to MoodNest chat UI, MoodNest support strategy, or provider/settings changes.
- Keep Milestone 1 and Milestone 2 reversible, build-testable, and isolated from current MoodNest runtime behavior.
