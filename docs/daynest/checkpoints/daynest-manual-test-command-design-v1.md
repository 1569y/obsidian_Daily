# DayNest Manual Test Command Design v1

## 1. Purpose

This document proposes the first runtime-facing DayNest validation step:

- a manual, developer-oriented test command

This is intentionally smaller and safer than introducing full DayNest UI.

## 2. Why The Next Runtime Step Should Be A Manual/Dev-Only Test Command

A manual/dev-only test command is the safest next step because:

- DayNest core layers already exist in isolation
- the daily note write path can be tested without building UI first
- the action preview and executor flow can be validated end to end
- the team can verify file creation and append behavior in a controlled way
- it avoids mixing early DayNest validation with MoodNest production flows

Conservative reasoning:

- a command is easier to reason about than a new modal, view, or sidebar
- a manual trigger reduces accidental writes
- build/test/debug feedback stays narrow and reversible

## 3. What The Command Would Test

The command should test this minimal chain only:

1. construct a sample `append_daily_log` action
2. build a preview from that action
3. execute only after explicit manual trigger
4. append to the resolved daily note through the DayNest executor dispatcher

Concrete validation goals:

- confirm `DayNestAction` shape is usable
- confirm preview generation is readable
- confirm executor dispatcher routes `append_daily_log`
- confirm daily note target resolution works
- confirm repository append creates or appends safely

## 4. Strict Safety Boundaries

The future command must follow these rules:

- command must be manually triggered only
- no automatic startup execution
- no Agent invocation
- no LLM call
- no background writes
- no hidden retries
- no changes to MoodNest archive files
- no implicit settings mutation
- no reuse of MoodNest live chat entry points

Conservative rule:

- if the command is not directly invoked by the user or developer, nothing should happen

## 5. Proposed Command Name And Id

Suggested command id:

- `daynest-run-manual-daily-log-test`

Suggested display name:

- `DayNest: Run Manual Daily Log Test`

Reason:

- explicit
- clearly marked as DayNest
- clearly marked as manual test behavior

## 6. Proposed Sample Content

The command should write obviously non-user-facing test content.

Suggested content characteristics:

- clearly marked as DayNest test content
- short
- timestamped
- easy to find and delete

Suggested sample block text:

```text
DayNest test entry
Manual dev command execution
```

Suggested action metadata:

- use a generated action id
- use current timestamp as `createdAt`
- use a same-day `MoonDailyLog` draft with a short summary

## 7. Required Dependencies

The future command implementation would likely need:

- `Vault` instance
- `DayNestDailyNoteRepository`
- `DayNestActionExecutor`
- `DEFAULT_DAYNEST_DAILY_NOTE_SETTINGS`
  - or explicit test settings if the batch chooses to avoid defaults

Minimal DayNest runtime chain:

- action construction
- preview builder
- dispatcher executor
- append daily log executor
- daily note repository

## 8. Expected Write Location

Based on the current default settings, the expected test write target would be:

- `NestHub/DayNest/daily/YYYY-MM-DD.md`

More precisely:

- the exact filename depends on the execution date
- the actual path is resolved through current DayNest daily note settings logic

If future settings change:

- the command should follow the resolved DayNest settings path
- it should not guess a second path independently

## 9. Failure Behavior

The future command should fail conservatively.

Recommended behavior:

- show a `Notice` for user-visible failure
- optionally log details with `console.warn` or `console.error`
- do not throw unhandled errors to the outer runtime

Recommended success behavior:

- show a small success `Notice`
- optionally log resolved file path for debugging

## 10. Rollback And Cleanup Guidance

If the test command writes unwanted content, cleanup should be manual and explicit.

Suggested rollback guidance:

- delete the test line manually
- or delete the test note manually if it was newly created
- do not add automated cleanup in the first command batch

Reason:

- manual cleanup is safer than adding delete logic too early
- it keeps the first runtime batch append-only

## 11. Future Implementation Boundaries

### Allowed files

The future code batch should stay narrowly scoped.

Suggested allowed files:

- `main.ts`
  - only for minimal command registration if needed
- `src/daynest/core/daynestActionExecutor.ts`
  - only if tiny integration adjustments are needed
- `src/daynest/core/daynestAppendDailyLogExecutor.ts`
  - only if tiny integration adjustments are needed
- `src/daynest/storage/daynestDailyNoteRepository.ts`
  - only if tiny integration adjustments are needed
- a new DayNest command file under:
  - `src/daynest/commands/`
  - or `src/commands/` if the project prefers central command registration

### Forbidden files

The future code batch should not touch:

- `src/services/agentService.ts`
- `src/services/apiAgentProvider.ts`
- `src/services/ruleBasedAgentProvider.ts`
- `src/services/llmClient.ts`
- `src/ui/modals/EmotionLogModal.ts`
- `src/settings.ts`
- `src/types.ts`
- `manifest.json`
- `package.json`

### Build and git checks

The future code batch should require:

- `npm run build`
- `git status --short`
- scoped diff review before finishing

## 12. Open Questions

These should remain open for now:

- whether to keep the command after MVP
- whether to guard it behind a dev flag
- whether to use a modal confirmation before execution
- whether the command should show the generated preview before execution
- whether success `Notice` text should include the resolved file path
- whether the command should stay DayNest-default-only or use current DayNest settings when settings wiring exists

## 13. Conservative Conclusion

Recommended next runtime step:

- add one manual/dev-only DayNest command
- validate only the `append_daily_log` action path
- keep the flow explicit, reversible, and append-only

This should be the smallest possible runtime checkpoint before any broader DayNest UI work.
