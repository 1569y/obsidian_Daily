import type {
  DayNestAction,
  DayNestActionPreview,
  DayNestActionConfirmationState,
  DayNestAppendDailyLogAction,
  DayNestCaptureExpenseAction,
  DayNestCaptureTaskAction,
  DayNestChangeDailyNoteSettingsAction,
  DayNestStartTimerAction,
} from "./daynestActions";

function requiresConfirmation(
  confirmationState: DayNestActionConfirmationState
): boolean {
  return confirmationState === "required" || confirmationState === "confirmed";
}

function formatOptionalLine(label: string, value: string | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return `${label}: ${value.trim()}`;
}

function buildAppendDailyLogPreview(
  action: DayNestAppendDailyLogAction
): DayNestActionPreview {
  const summary = action.dailyLogDraft.summary?.trim()
    ? `Append daily log for ${action.dailyLogDraft.date}: ${action.dailyLogDraft.summary.trim()}`
    : `Append daily log for ${action.dailyLogDraft.date}`;

  return {
    actionId: action.id,
    kind: action.kind,
    title: "Append Daily Log",
    summary,
    confirmationRequired: requiresConfirmation(action.confirmationState),
    confirmationState: action.confirmationState,
  };
}

function buildCaptureTaskPreview(
  action: DayNestCaptureTaskAction
): DayNestActionPreview {
  const details = [
    formatOptionalLine("Due", action.taskDraft.dueDate),
    formatOptionalLine("Priority", action.taskDraft.priority),
    formatOptionalLine("Project", action.taskDraft.project),
    action.taskDraft.tags && action.taskDraft.tags.length > 0
      ? `Tags: ${action.taskDraft.tags.join(", ")}`
      : null,
  ].filter((value): value is string => typeof value === "string");

  return {
    actionId: action.id,
    kind: action.kind,
    title: "Capture Task",
    summary: `Create task: ${action.taskDraft.title}`,
    confirmationRequired: requiresConfirmation(action.confirmationState),
    confirmationState: action.confirmationState,
    details: details.length > 0 ? details : undefined,
  };
}

function buildCaptureExpensePreview(
  action: DayNestCaptureExpenseAction
): DayNestActionPreview {
  const noteSuffix = action.expenseDraft.note?.trim()
    ? ` (${action.expenseDraft.note.trim()})`
    : "";

  return {
    actionId: action.id,
    kind: action.kind,
    title: "Capture Expense",
    summary: `Record expense: ${action.expenseDraft.amount} ${action.expenseDraft.currency} - ${action.expenseDraft.category}${noteSuffix}`,
    confirmationRequired: requiresConfirmation(action.confirmationState),
    confirmationState: action.confirmationState,
  };
}

function buildStartTimerPreview(
  action: DayNestStartTimerAction
): DayNestActionPreview {
  return {
    actionId: action.id,
    kind: action.kind,
    title: "Start Timer",
    summary: `Start timer: ${action.timerDraft.label}`,
    confirmationRequired: requiresConfirmation(action.confirmationState),
    confirmationState: action.confirmationState,
  };
}

function buildChangeDailyNoteSettingsPreview(
  action: DayNestChangeDailyNoteSettingsAction
): DayNestActionPreview {
  return {
    actionId: action.id,
    kind: action.kind,
    title: "Change Daily Note Settings",
    summary: "Update DayNest daily note folder or date format",
    confirmationRequired: action.confirmationState !== "cancelled",
    confirmationState: action.confirmationState,
    details: [
      `Current folder: ${action.currentSettings.dailyNoteFolder}`,
      `Current date format: ${action.currentSettings.dailyNoteDateFormat}`,
      `Proposed folder: ${action.proposedSettings.dailyNoteFolder}`,
      `Proposed date format: ${action.proposedSettings.dailyNoteDateFormat}`,
    ],
  };
}

export function buildDayNestActionPreview(
  action: DayNestAction
): DayNestActionPreview {
  switch (action.kind) {
    case "append_daily_log":
      return buildAppendDailyLogPreview(action);
    case "capture_task":
      return buildCaptureTaskPreview(action);
    case "capture_expense":
      return buildCaptureExpensePreview(action);
    case "start_timer":
      return buildStartTimerPreview(action);
    case "change_daily_note_settings":
      return buildChangeDailyNoteSettingsPreview(action);
  }
}
