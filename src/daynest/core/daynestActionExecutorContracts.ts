import type { DayNestAction, DayNestActionKind } from "./daynestActions";

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

export interface DayNestActionExecutorContext {}

export interface DayNestActionExecutorContract {
  execute(
    action: DayNestAction,
    context: DayNestActionExecutorContext
  ): Promise<DayNestActionExecutionResult>;
}
