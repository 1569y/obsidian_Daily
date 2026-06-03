# DayNest Daily Agent Design v1

## 1. Current MoodNest Architecture Summary

Current confirmed checkpoint:

- The active plugin is still `MoodNest`.
- `main.ts` remains the plugin shell and bootstrap entry.
- `AgentService` is the current orchestration center for live support chat.
- `ApiAgentProvider` still owns provider-specific state.
- `src/services/llmClient.ts` now holds reusable LLM transport and retry helpers.
- `requestChatCompletionJson()` remains inside `ApiAgentProvider` and is unchanged.
- `analyze()`, `reply()`, and `replyTurn()` behavior must remain MoodNest-specific and unchanged.
- `AsrService`, `whisperCppManager.ts`, `whisperCppAssetManager.ts`, `llmProviderProfiles.ts`, `llmResponseParsers.ts`, and `folderService.ts` are the strongest existing reusable-core candidates.

Current architecture intent:

- `MoodNest` is still the emotional support assistant.
- `NestHub` is still only a future architecture direction, not a current runtime module system.
- `DayNest` does not exist in runtime code yet and should not be mixed into current MoodNest-specific files.

## 2. Shared Services DayNest Can Reuse

The following parts appear reusable with the least product-identity risk:

- `src/services/llmClient.ts`
  - Shared LLM transport
  - Retry orchestration
  - Payload inspection and logging helpers
- `src/services/llmProviderProfiles.ts`
  - Provider capability profile mapping
- `src/services/llmResponseParsers.ts`
  - Provider response parsing and normalization
- `src/services/folderService.ts`
  - Vault folder existence helpers
- `src/services/asrService.ts`
  - Future optional speech-to-text entry point
- `src/services/whisperCppManager.ts`
  - Desktop-local STT runtime candidate
- `src/services/whisperCppAssetManager.ts`
  - Desktop-local STT asset management candidate
- `src/services/speechService.ts`
  - Browser recording utility candidate
- `src/services/groundingAssetResolver.ts`
  - General asset resolution pattern candidate

Reuse rule:

- Reuse transport, parsing, storage helpers, and generic vault infrastructure first.
- Do not directly reuse MoodNest-specific support policy as if it were a neutral shared layer.

## 3. MoodNest-Specific Parts That Must Not Be Touched

The following must remain isolated from DayNest planning and future DayNest MVP implementation:

- `src/services/agentService.ts` current MoodNest routing behavior
- `src/services/ruleBasedAgentProvider.ts`
- `src/services/actionRecommendation.ts`
- `src/services/lowEnergyDecisionPolicy.ts`
- `src/services/longTextIntakePolicy.ts`
- `src/services/moodnestSupportStrategy.ts`
- `src/ui/modals/EmotionLogModal.ts`
- MoodNest live support wording, containment rhythm, and support identity
- Current provider selection behavior
- Current provider `baseUrl` handling
- Current `model` handling
- Current `apiKey` handling
- Current fallback behavior
- Current archive output behavior

Safety rule:

- DayNest must be added beside MoodNest later, not by gradually polluting MoodNest-specific files with daily-agent logic.

## 4. Proposed DayNest Module Boundaries

Recommended future boundaries:

- `src/daynest/core/`
  - DayNest-specific domain types
  - Intent schema
  - storage contracts
- `src/daynest/agent/`
  - Daily Agent orchestration
  - prompt assembly
  - response parsing for daily tasks
- `src/daynest/storage/`
  - task, expense, timer, and daily log vault writers/readers
- `src/daynest/ui/`
  - sidebar agent shell
  - daily hub view
  - quick capture modal
- `src/shared/llm/`
  - Only if future extraction is needed beyond current `src/services/llmClient.ts`

Conservative boundary rule:

- `DayNest` should depend on shared LLM transport helpers.
- `DayNest` should not depend on MoodNest support-policy files.

## 5. Proposed Daily Agent Intent Schema

Proposed top-level intent categories:

- `capture_task`
- `update_task`
- `complete_task`
- `capture_expense`
- `update_expense`
- `start_timer`
- `stop_timer`
- `append_daily_log`
- `summarize_day`
- `clarify_missing_fields`
- `chat_only`

Proposed response envelope:

```ts
type DayNestIntent =
  | "capture_task"
  | "update_task"
  | "complete_task"
  | "capture_expense"
  | "update_expense"
  | "start_timer"
  | "stop_timer"
  | "append_daily_log"
  | "summarize_day"
  | "clarify_missing_fields"
  | "chat_only";

interface DayNestAgentResult {
  intent: DayNestIntent;
  confidence: number;
  replyText: string;
  missingFields?: string[];
  taskDraft?: MoonTask;
  expenseDraft?: MoonExpense;
  timerDraft?: MoonTimer;
  dailyLogDraft?: MoonDailyLog;
}
```

Intent design rule:

- DayNest should default to structured capture and light clarification.
- It should not inherit MoodNest’s contain / clarify / ground emotional reply rhythm as its default output format.

## 6. Proposed Data Models

### MoonTask

```ts
interface MoonTask {
  id: string;
  title: string;
  status: "inbox" | "next" | "doing" | "blocked" | "done" | "archived";
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  project?: string;
  tags?: string[];
  notes?: string;
  source: "agent" | "quick_capture" | "manual";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

### MoonExpense

```ts
interface MoonExpense {
  id: string;
  amount: number;
  currency: string;
  category: string;
  note?: string;
  occurredAt: string;
  source: "agent" | "quick_capture" | "manual";
  createdAt: string;
  updatedAt: string;
}
```

### MoonTimer

```ts
interface MoonTimer {
  id: string;
  label: string;
  status: "idle" | "running" | "stopped";
  startedAt?: string;
  stoppedAt?: string;
  elapsedMs: number;
  linkedTaskId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### MoonDailyLog

```ts
interface MoonDailyLog {
  id: string;
  date: string;
  summary?: string;
  wins?: string[];
  blockers?: string[];
  notes?: string[];
  linkedTaskIds?: string[];
  linkedExpenseIds?: string[];
  linkedTimerIds?: string[];
  createdAt: string;
  updatedAt: string;
}
```

Conservative modeling note:

- These are draft storage-facing shapes, not approved runtime types.
- Actual future field lists should be validated against vault writing ergonomics and Obsidian user expectations before implementation.

## 7. Proposed Vault Storage Layout

Recommended default layout:

- `NestHub/DayNest/tasks/`
- `NestHub/DayNest/expenses/`
- `NestHub/DayNest/timers/`
- `NestHub/DayNest/daily/`
- `NestHub/DayNest/inbox/`

Recommended file strategy:

- Tasks
  - One Markdown file per task, or one index file plus per-task note later
- Expenses
  - Monthly ledger files such as `NestHub/DayNest/expenses/2026-05.md`
- Timers
  - Lightweight session log files, or append-only daily timer logs
- Daily logs
  - One daily Markdown note such as `NestHub/DayNest/daily/2026-05-29.md`

Conservative recommendation:

- Start with plain Markdown storage first.
- Avoid database-like complexity in MVP.
- Avoid touching MoodNest archive layout.

## 8. Proposed UI Entry Points

### Agent Sidebar

Purpose:

- A lightweight DayNest interaction surface for structured daily capture
- Better suited than reusing `EmotionLogModal.ts`

Recommended functions:

- quick text capture
- recent task list
- active timer card
- pending clarifications

### Daily Hub View

Purpose:

- A higher-structure daily dashboard, separate from emotional support chat

Recommended sections:

- today’s tasks
- current timer
- quick expense capture
- end-of-day summary
- daily log history

### Quick Capture Modal

Purpose:

- Fast low-friction capture for tasks, expenses, and notes

Recommended rule:

- Keep it much smaller than `EmotionLogModal.ts`
- Do not inherit MoodNest’s chat-heavy shell unless later user testing proves it useful

## 9. Proposed Implementation Milestones

### Milestone 0: Docs Only

- Finalize DayNest architecture direction
- Confirm storage and UI entry assumptions
- Confirm non-goals

### Milestone 1: Types and Storage Contracts

- Add DayNest-only types
- Add vault path constants
- Add storage helpers without UI wiring

### Milestone 2: Daily Agent Interface

- Add DayNest-only agent interface
- Reuse `llmClient.ts` transport layer
- Keep MoodNest untouched

### Milestone 3: Quick Capture MVP

- Quick capture modal
- task capture
- expense capture
- daily log append

### Milestone 4: Sidebar Agent MVP

- Add DayNest sidebar entry
- Add clarify-and-confirm flow for structured writes

### Milestone 5: Daily Hub View

- add aggregated view for tasks, timers, expenses, and daily summary

### Milestone 6: Optional Speech Extensions

- Evaluate whether DayNest needs STT reuse
- Do not assume it is part of MVP

## 10. MVP Non-Goals

The following should not be DayNest MVP goals:

- full project management system
- advanced recurring task engine
- budget analytics dashboard
- calendar sync
- automatic provider switching
- replacing MoodNest
- merging MoodNest and DayNest into one ambiguous assistant
- refactoring `requestChatCompletionJson()`

## 11. Risk List

- MoodNest and DayNest identity bleed
  - Daily productivity requests may accidentally inherit emotional support tone
- Shared settings pressure
  - Future DayNest may want different provider behavior without changing current settings contract
- Storage fragmentation
  - Too many files too early may create user friction
- Premature UI coupling
  - Reusing `EmotionLogModal.ts` would likely import too much MoodNest behavior
- Intent overreach
  - One agent trying to do tasks, expenses, timers, and journaling at once may become unstable
- Archive confusion
  - Users may confuse MoodNest emotional archive with DayNest daily records

## 12. Migration Safety Rules

- Do not modify current MoodNest runtime behavior during DayNest planning.
- Do not put DayNest logic into `src/services/agentService.ts` until a dedicated DayNest module boundary exists.
- Do not modify `ApiAgentProvider` or `llmClient` just to “prepare for DayNest” unless a dedicated, reversible task requires it.
- Do not change provider, model, `apiKey`, fallback, or settings contracts during DayNest MVP planning.
- Do not reuse `EmotionLogModal.ts` as the first DayNest UI shell.
- Do not mix DayNest records into MoodNest archive paths.
- Prefer additive files and interfaces over invasive rewrites.
- Keep every future DayNest step reversible and build-testable.

## 13. Open Questions

- Should DayNest share the same provider profile as MoodNest by default, or later support an independent active profile?
- Should DayNest tasks write into custom DayNest storage only, or optionally mirror Obsidian Tasks-compatible syntax?
- Should expenses stay Markdown-native, or later move to structured JSON sidecars?
- Should timers be stored as append-only logs or as mutable state files?
- Does DayNest need its own sidebar view first, or should quick capture come first?
- Should DayNest allow free chat, or stay mostly intent-driven in MVP?
- How much of `src/types.ts` should remain shared before a dedicated DayNest type layer exists?
- Does DayNest need STT at all in MVP, or should speech stay MoodNest-only at first?
- Should Daily Hub be a custom view, a modal, or a note-driven dashboard?
- How should NestHub eventually present multiple assistant identities without confusing users?
