import type { DayNestDailyNoteSettings } from "./daynestDailyNoteSettings";
import type { MoonDailyLog, MoonExpense, MoonTask, MoonTimer } from "./daynestTypes";

export type DayNestActionKind =
  | "append_daily_log"
  | "capture_task"
  | "capture_expense"
  | "start_timer"
  | "change_daily_note_settings";

export type DayNestActionSource =
  | "agent"
  | "quick_capture"
  | "manual"
  | "settings_flow";

export type DayNestActionConfirmationState =
  | "not_required"
  | "required"
  | "confirmed"
  | "cancelled";

export type DayNestActionResultStatus =
  | "pending_confirmation"
  | "ready"
  | "applied"
  | "cancelled"
  | "rejected";

interface DayNestActionBase {
  id: string;
  kind: DayNestActionKind;
  source: DayNestActionSource;
  createdAt: string;
  confirmationState: DayNestActionConfirmationState;
}

export interface DayNestAppendDailyLogAction extends DayNestActionBase {
  kind: "append_daily_log";
  dailyLogDraft: MoonDailyLog;
}

export interface DayNestCaptureTaskAction extends DayNestActionBase {
  kind: "capture_task";
  taskDraft: MoonTask;
}

export interface DayNestCaptureExpenseAction extends DayNestActionBase {
  kind: "capture_expense";
  expenseDraft: MoonExpense;
}

export interface DayNestStartTimerAction extends DayNestActionBase {
  kind: "start_timer";
  timerDraft: MoonTimer;
}

export interface DayNestChangeDailyNoteSettingsAction extends DayNestActionBase {
  kind: "change_daily_note_settings";
  confirmationState: "required" | "confirmed" | "cancelled";
  currentSettings: DayNestDailyNoteSettings;
  proposedSettings: DayNestDailyNoteSettings;
}

export type DayNestAction =
  | DayNestAppendDailyLogAction
  | DayNestCaptureTaskAction
  | DayNestCaptureExpenseAction
  | DayNestStartTimerAction
  | DayNestChangeDailyNoteSettingsAction;

export interface DayNestActionResult {
  actionId: string;
  kind: DayNestActionKind;
  status: DayNestActionResultStatus;
  confirmationState: DayNestActionConfirmationState;
  message?: string;
}

export interface DayNestActionPreview {
  actionId: string;
  kind: DayNestActionKind;
  title: string;
  summary: string;
  confirmationRequired: boolean;
  confirmationState: DayNestActionConfirmationState;
  details?: string[];
}
