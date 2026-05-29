import type { DayNestAction, DayNestActionKind } from "./daynestActions";
import type { DayNestDailyNoteSettings } from "./daynestDailyNoteSettings";
import type { DayNestDailyNoteRepositoryContract } from "./daynestStorageContracts";

export type DayNestActionExecutionStatus =
  | "applied"
  | "pending_confirmation"
  | "cancelled"
  | "rejected"
  | "failed";

export interface DayNestActionExecutionResult {
  actionId: string;
  kind: DayNestActionKind;
  status: DayNestActionExecutionStatus;
  message?: string;
  filePath?: string;
  errorMessage?: string;
}

export interface DayNestActionExecutorContext {
  dailyNoteSettings: DayNestDailyNoteSettings;
  dailyNoteRepository: DayNestDailyNoteRepositoryContract;
  now?: Date;
}

export interface DayNestActionExecutorContract {
  execute(
    action: DayNestAction,
    context: DayNestActionExecutorContext
  ): Promise<DayNestActionExecutionResult>;
}
